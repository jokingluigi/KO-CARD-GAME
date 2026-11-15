#!/usr/bin/env python3
"""Bounded Oracle Cloud Shell A1 capacity retries. Never upgrades accounts or changes Render/DB."""
import argparse
import fcntl
import itertools
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

REGION = 'ap-singapore-1'
SHAPE = 'VM.Standard.A1.Flex'
NAME = 'ko-game-server'
ATTEMPTS = 12
INTERVAL = 600
# Temporary migration access authorized by the server migration task; private key stays outside the repository.
MIGRATION_PUBLIC_KEY = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIK04GpmqytDdpSOQSE64dC3/cHp7nyBkkWAxHaLMclU9 ko-game-migration'


class Stop(RuntimeError):
    pass


class CommandError(Stop):
    def __init__(self, message, returncode=None):
        super().__init__(message)
        self.usage_error = returncode == 2 and "Usage:" in message and "Error:" in message
        self.capacity = bool(re.search(r'out of (?:host )?capacity', message, re.I))


def cli(*args):
    label = ' '.join(args[:3])
    print('[OCI] ' + label, flush=True)
    try:
        r = subprocess.run(['oci', '--region', REGION, '--output', 'json', *args],
                           capture_output=True, text=True, timeout=180)
    except (subprocess.TimeoutExpired, OSError) as e:
        raise Stop('CLI 실행 결과가 불확실합니다. 자동 재시도를 중단합니다: ' + str(type(e).__name__)) from e
    if r.returncode:
        # CLI payloads here contain resource metadata only, never private key material.
        raise CommandError((r.stderr or r.stdout)[-3500:], r.returncode)
    # OCI CLI may successfully render no text for an empty collection. Only list
    # commands accept that representation; never treat an empty POST/GET as success.
    if not r.stdout.strip() and len(args) >= 3 and args[2] == 'list':
        return []
    try:
        return json.loads(r.stdout)['data']
    except (ValueError, KeyError) as e:
        raise Stop(label + ': 응답을 해석하지 못했습니다. 자동 재시도를 중단합니다.') from e


def write_state(path, data):
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(data))
    temp.chmod(0o600)
    temp.replace(path)


def live_instances(compartment):
    return [i for i in cli('compute', 'instance', 'list', '--compartment-id', compartment, '--all')
            if i.get('lifecycle-state') != 'TERMINATED']


def find_existing(instances):
    matches = [i for i in instances if i.get('display-name') == NAME]
    if len(matches) > 1:
        raise Stop('동일 이름의 서버가 여러 개 있습니다. 추가 생성하지 않습니다.')
    if matches:
        if matches[0].get('lifecycle-state') not in ('PROVISIONING', 'RUNNING', 'STARTING'):
            raise Stop('기존 서버가 있습니다. 상태 확인 전에는 추가 생성하지 않습니다.')
        return matches[0]
    if any(i.get('shape') == SHAPE for i in instances):
        raise Stop('이미 다른 A1 서버가 있습니다. 무료 할당량 확인 전 추가 생성하지 않습니다.')
    return None


def inspect_storage(compartment, domains):
    volumes = cli('bv', 'volume', 'list', '--compartment-id', compartment, '--all')
    for domain in domains:
        volumes += cli('bv', 'boot-volume', 'list', '--compartment-id', compartment,
                       '--availability-domain', domain['name'], '--all')
    total = sum(v.get('size-in-gbs', 0) for v in volumes if v.get('lifecycle-state') != 'TERMINATED')
    # Conservative guard against the historically published 200 GB total; not a billing entitlement check.
    if total + 50 > 200:
        raise Stop('기존 볼륨과 신규 50GB 합계가 200GB를 넘습니다. 생성하지 않습니다.')


def preflight(compartment, result_file):
    regions = cli('iam', 'region-subscription', 'list', '--tenancy-id', compartment, '--all')
    if not any(r.get('region-name') == REGION and r.get('is-home-region') is True for r in regions):
        raise Stop('싱가포르가 홈 리전이 아닙니다. 생성하지 않습니다.')
    subnet_id = None
    for line in result_file.read_text().splitlines():
        if line.startswith('Subnet ID: '):
            subnet_id = line.split(': ', 1)[1].strip()
    if not subnet_id or not subnet_id.startswith('ocid1.subnet.'):
        raise Stop('저장된 공개 서브넷 ID를 찾지 못했습니다.')
    subnet = cli('network', 'subnet', 'get', '--subnet-id', subnet_id)
    if subnet.get('compartment-id') != compartment or subnet.get('prohibit-public-ip-on-vnic') is not False:
        raise Stop('서브넷 소유 영역 또는 공인 IP 허용 설정이 맞지 않습니다.')
    domains = cli('iam', 'availability-domain', 'list', '--compartment-id', compartment)
    if subnet.get('availability-domain'):
        domains = [d for d in domains if d['name'] == subnet['availability-domain']]
    if not domains:
        raise Stop('사용할 수 있는 가용 영역이 없습니다.')
    inspect_storage(compartment, domains)
    images = cli('compute', 'image', 'list', '--compartment-id', compartment,
                 '--operating-system', 'Canonical Ubuntu', '--shape', SHAPE, '--all')
    candidates = [i for i in images if i.get('lifecycle-state') == 'AVAILABLE'
                  and re.search(r'24[.]04', i.get('display-name', ''))
                  and 'aarch64' in i.get('display-name', '').lower()]
    if not candidates:
        raise Stop('Ubuntu 24.04 ARM 공식 이미지를 찾지 못했습니다. 다른 유료 이미지로 대체하지 않습니다.')
    image = max(candidates, key=lambda i: i.get('time-created', ''))
    return subnet_id, domains, image['id']


def ensure_key(directory):
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    key = directory / 'oracle-owner'
    if not key.exists():
        if key.with_suffix('.pub').exists():
            raise Stop('공개키만 있고 개인키가 없습니다. 기존 파일을 덮어쓰지 않습니다.')
        subprocess.run(['ssh-keygen', '-q', '-t', 'rsa', '-b', '4096', '-N', '', '-f', str(key)], check=True)
    if not key.with_suffix('.pub').exists():
        raise Stop('SSH 공개키 파일이 없습니다. 기존 개인키를 변경하지 않습니다.')
    key.chmod(0o600)
    return key, key.with_suffix('.pub').read_text().strip()


def announce(instance):
    print('\nSERVER FOUND — 자동 생성을 종료합니다.', flush=True)
    print('이름:', instance.get('display-name'), '\n상태:', instance.get('lifecycle-state'))
    print('Instance ID:', instance['id'])
    print('Oracle 인스턴스 목록에서 이 서버를 열어 주세요. 아직 게임 이전은 하지 않았습니다.', flush=True)


def validate_launch_options():
    """Ask the installed CLI itself; generated API options can be hidden by CLI extensions."""
    required = {'--compartment-id', '--availability-domain', '--display-name', '--shape',
                '--shape-config', '--source-details', '--subnet-id', '--assign-public-ip', '--metadata'}
    try:
        r = subprocess.run(['oci', 'compute', 'instance', 'launch', '--help'],
                           env={**os.environ, 'PAGER': 'cat', 'MANPAGER': 'cat'},
                           capture_output=True, text=True, timeout=60)
    except (OSError, subprocess.TimeoutExpired) as e:
        raise Stop('OCI CLI 사용법 확인에 실패했습니다. 서버 생성은 시작하지 않았습니다.') from e
    if r.returncode:
        raise Stop('OCI CLI 사용법 확인이 거절됐습니다. 서버 생성은 시작하지 않았습니다.')
    available = set(re.findall(r'--[a-z][a-z0-9-]*', r.stdout))
    missing = required - available
    if missing:
        raise Stop('설치된 CLI에 필요한 옵션이 없습니다: ' + ', '.join(sorted(missing)))


def recover_confirmed_old_usage_error(journal, domains):
    """Only explicit operator attestation of the previously documented pre-API CLI rejection."""
    if not journal.exists():
        return
    pending = json.loads(journal.read_text())
    if pending.get('status') in ('capacity-rejected', 'cli-rejected'):
        return
    if (set(pending) != {'status', 'domain'} or pending.get('status') != 'request-started'
            or pending['domain'] not in {d['name'] for d in domains}):
        raise Stop('이 기록은 알려진 구버전 CLI 옵션 오류와 일치하지 않습니다. 자동으로 지우지 않습니다.')
    backup = journal.with_name('launch-before-cli-fix.json')
    if backup.exists():
        raise Stop('이미 복구를 한 번 수행한 기록이 있습니다. 불확실한 요청을 다시 초기화하지 않습니다.')
    write_state(backup, pending)
    write_state(journal, {'status': 'cli-rejected', 'reason': 'operator-confirmed old unsupported-option error'})
    print('이전에 API 전송 전에 거절된 CLI 옵션 오류 기록을 보관하고 복구했습니다.', flush=True)


def retry(compartment, subnet_id, domains, image_id, public_key, journal, sleep=time.sleep, attempts=None, interval=None):
    attempts = ATTEMPTS if attempts is None else attempts
    interval = INTERVAL if interval is None else interval
    if interval < 60:
        raise Stop('재시도 간격은 최소 60초입니다.')
    if attempts < 0:
        raise Stop('재시도 횟수는 0(성공까지) 또는 양수여야 합니다.')
    for attempt in itertools.count(1):
        existing = find_existing(live_instances(compartment))
        if existing:
            announce(existing)
            return existing
        # An interrupted/ambiguous launch must never become a second POST automatically.
        if journal.exists():
            pending = json.loads(journal.read_text())
            if pending.get('status') not in ('capacity-rejected', 'cli-rejected'):
                raise Stop('이전 생성 요청의 결과가 불확실합니다. 중복 방지를 위해 수동 확인이 필요합니다.')
        for domain in domains:
            existing = find_existing(live_instances(compartment))
            if existing:
                announce(existing)
                return existing
            # Failed provider launches can leave volumes behind. Recheck before every POST.
            inspect_storage(compartment, domains)
            write_state(journal, {'status': 'request-started', 'domain': domain['name'], 'schema': 2})
            limit = str(attempts) if attempts else '성공까지'
            print(f'[{attempt}/{limit}] {domain["name"]}: A1 2 OCPU / 12GB / 디스크 50GB 시도', flush=True)
            try:
                instance = cli('compute', 'instance', 'launch', '--compartment-id', compartment,
                               '--availability-domain', domain['name'], '--display-name', NAME,
                               '--shape', SHAPE, '--shape-config', json.dumps({'ocpus': 2, 'memoryInGBs': 12}),
                               '--source-details', json.dumps({'sourceType': 'image', 'imageId': image_id,
                                                             'bootVolumeSizeInGBs': 50}),
                               '--subnet-id', subnet_id, '--assign-public-ip', 'true',
                               '--metadata', json.dumps({'ssh_authorized_keys': public_key}))
            except CommandError as e:
                if e.usage_error:
                    write_state(journal, {'status': 'cli-rejected', 'domain': domain['name'], 'schema': 2})
                    raise
                if not e.capacity:
                    raise
                write_state(journal, {'status': 'capacity-rejected', 'domain': domain['name']})
                print('재고 부족. 다른 사양/유료 계정으로 전환하지 않습니다.', flush=True)
                continue
            write_state(journal, {'status': 'created', 'instance-id': instance['id']})
            announce(instance)
            return instance
        if attempts and attempt >= attempts:
            print(f'{attempts}회 모두 재고 부족입니다. 자동 시도를 종료했습니다.', flush=True)
            return None
        print(f'{interval}초 후 다시 시도합니다. 중단: Ctrl+C. Cloud Shell을 닫으면 계속 실행된다고 보장할 수 없습니다.', flush=True)
        sleep(interval)


def main():
    parser = argparse.ArgumentParser(description='Fixed A1 2 OCPU / 12GB capacity retries; never upgrades billing.')
    parser.add_argument('--attempts', type=int, default=ATTEMPTS, help='0: until success/session ends; otherwise bounded rounds')
    parser.add_argument('--interval', type=int, default=INTERVAL, help='Seconds after a capacity-rejected round; minimum 60')
    parser.add_argument('--recover-old-cli-error', action='store_true',
                        help='Use only after the documented old --create-vnic-details usage rejection, never for a timeout')
    args = parser.parse_args()
    if args.attempts < 0:
        parser.error('--attempts must be 0 or greater')
    if args.interval < 60:
        parser.error('--interval must be at least 60 seconds')
    compartment = os.environ.get('OCI_TENANCY') or os.environ.get('OCI_CLI_TENANCY')
    if not compartment:
        raise Stop('Cloud Shell 계정 정보를 찾지 못했습니다.')
    folder = Path.home() / '.ko-oracle-a1'
    folder.mkdir(mode=0o700, exist_ok=True)
    with (folder / 'lock').open('w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as e:
            raise Stop('이미 실행 중입니다. 동시에 두 번 실행하지 않습니다.') from e
        existing = find_existing(live_instances(compartment))
        if existing:
            announce(existing)
            return
        result = Path.home() / 'ko-game-network-result.txt'
        if not result.exists():
            raise Stop('앞서 저장한 네트워크 파일이 없습니다. 새 네트워크를 임의로 만들지 않습니다.')
        validate_launch_options()
        subnet, domains, image = preflight(compartment, result)
        if args.recover_old_cli_error:
            recover_confirmed_old_usage_error(folder / 'launch.json', domains)
        key, public = ensure_key(folder)
        print('접속 개인키 보관 위치:', str(key), '(내용은 공유하지 마세요)', flush=True)
        print('무료 계정 업그레이드/결제 설정 변경 없음. 기존 Render/DB 변경 없음.', flush=True)
        print('프로젝트 이전 작업용 공개키도 등록합니다. 개인키를 전달할 필요는 없습니다.', flush=True)
        retry(compartment, subnet, domains, image, public + '\n' + MIGRATION_PUBLIC_KEY, folder / 'launch.json', attempts=args.attempts, interval=args.interval)


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print('\n중단했습니다. 진행 중 요청이 있으면 다음 실행에서 중복 생성 없이 확인합니다.', file=sys.stderr)
        sys.exit(130)
    except (Stop, subprocess.CalledProcessError) as e:
        print('STOP:', str(e), file=sys.stderr)
        sys.exit(1)
