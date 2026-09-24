import { useEffect, useMemo, useState, type CSSProperties } from "react";

import styles from "./online-match-intro.module.css";

export interface MatchIntroPlayer {
  displayName: string;
  championName: string;
  portraitUrl: string | null;
  dialogueLine: string | null;
}

export interface MatchIntroOverlayProps {
  self: MatchIntroPlayer;
  opponent: MatchIntroPlayer;
  firstSpeaker: "self" | "opponent" | null;
  startedAt: number;
  gameplayStartsAt: number;
  onSkipRequest: () => void;
}

type Speaker = "self" | "opponent";

interface DialogueTurn {
  speaker: Speaker;
  line: string;
  startAt: number;
}

interface PortraitProps {
  player: MatchIntroPlayer;
  side: Speaker;
}

function getInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return `${words[0]![0]}${words.at(-1)![0]}`.toUpperCase();
}

function Portrait({ player, side }: PortraitProps) {
  const [portraitFailed, setPortraitFailed] = useState(false);

  useEffect(() => {
    setPortraitFailed(false);
  }, [player.portraitUrl]);

  return (
    <div className={styles.portraitWrap} data-testid={`portrait-${side}`}>
      <div className={styles.portraitFrame}>
        <span className={styles.portraitFallback} aria-hidden="true">
          {getInitials(player.championName)}
        </span>
        {player.portraitUrl && !portraitFailed ? (
          <img
            className={styles.portraitImage}
            src={player.portraitUrl}
            alt={`${player.championName} portrait`}
            data-testid={`img-champion-portrait-${side}`}
            onError={() => setPortraitFailed(true)}
          />
        ) : null}
      </div>
    </div>
  );
}

function IdentityBlock({ player, side }: PortraitProps) {
  return (
    <div className={styles.identity} data-testid={`identity-${side}`}>
      <span className={styles.role}>{side === "self" ? "PLAYER ONE" : "PLAYER TWO"}</span>
      <span className={styles.displayName} data-testid={`text-display-name-${side}`}>
        {player.displayName}
      </span>
      <span className={styles.championName} data-testid={`text-champion-name-${side}`}>
        {player.championName}
      </span>
    </div>
  );
}

function DialogueBlock({
  player,
  side,
  visible,
}: PortraitProps & { visible: boolean }) {
  const line = player.dialogueLine?.trim();
  if (!line) return null;

  return (
    <div
      className={styles.dialogue}
      data-visible={visible}
      data-testid={`dialogue-${side}`}
      aria-live="polite"
    >
      <span className={styles.dialogueLabel}>{player.championName}</span>
      <span className={styles.dialogueText}>「{line}」</span>
    </div>
  );
}

export function MatchIntroOverlay({
  self,
  opponent,
  firstSpeaker,
  startedAt,
  gameplayStartsAt,
  onSkipRequest,
}: MatchIntroOverlayProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const updateClock = () => setNow(Date.now());
    updateClock();
    const intervalId = window.setInterval(updateClock, 50);
    return () => window.clearInterval(intervalId);
  }, [startedAt, gameplayStartsAt]);

  const elapsed = Math.max(0, now - startedAt);
  const introDuration = Math.max(
    3000,
    Math.min(4200, gameplayStartsAt > startedAt ? gameplayStartsAt - startedAt : 3600),
  );

  const turns = useMemo<DialogueTurn[]>(() => {
    const speakerOrder: Speaker[] = firstSpeaker === "self"
      ? ["self", "opponent"]
      : ["opponent", "self"];
    const players = { self, opponent };
    const availableTurns = speakerOrder
      .map((speaker) => ({
        speaker,
        line: players[speaker].dialogueLine?.trim() ?? "",
      }))
      .filter((turn): turn is { speaker: Speaker; line: string } => Boolean(turn.line));

    return availableTurns.map((turn, index) => ({
      ...turn,
      startAt: index === 0 ? 1000 : 1700,
    }));
  }, [firstSpeaker, opponent, self]);

  const versusAt = turns.length === 2 ? 2600 : turns.length === 1 ? 2050 : 1450;
  const activeSpeaker = turns.reduce<Speaker | null>((active, turn) => (
    elapsed >= turn.startAt && elapsed < versusAt ? turn.speaker : active
  ), null);
  const skipAvailable = elapsed >= 900;
  const sceneStyle = {
    "--intro-duration": `${introDuration}ms`,
    "--intro-elapsed": `${elapsed}ms`,
    "--versus-at": `${versusAt}ms`,
  } as CSSProperties;

  return (
    <div
      className={styles.overlay}
      style={sceneStyle}
      role="dialog"
      aria-label="Online match introduction"
      data-testid="match-intro-overlay"
      data-intro-phase={elapsed >= versusAt ? "versus" : activeSpeaker ?? "entrance"}
    >
      <main className={styles.scene}>
        <div className={styles.sceneHeader} aria-hidden="true">
          ONLINE MATCH
        </div>

        <section
          className={styles.player}
          data-side="self"
          data-active={activeSpeaker === null || activeSpeaker === "self"}
          aria-label={`Your champion: ${self.championName}`}
        >
          <Portrait player={self} side="self" />
          <IdentityBlock player={self} side="self" />
          <DialogueBlock player={self} side="self" visible={turns.some((turn) => turn.speaker === "self" && elapsed >= turn.startAt)} />
        </section>

        <div className={styles.versusColumn} aria-hidden="true">
          <div className={styles.impactFlash} />
          <div className={styles.versus} data-testid="text-versus">
            VS
          </div>
        </div>

        <section
          className={styles.player}
          data-side="opponent"
          data-active={activeSpeaker === null || activeSpeaker === "opponent"}
          aria-label={`Opponent champion: ${opponent.championName}`}
        >
          <Portrait player={opponent} side="opponent" />
          <IdentityBlock player={opponent} side="opponent" />
          <DialogueBlock player={opponent} side="opponent" visible={turns.some((turn) => turn.speaker === "opponent" && elapsed >= turn.startAt)} />
        </section>

        {skipAvailable ? (
          <button
            className={styles.skipButton}
            type="button"
            onClick={onSkipRequest}
            data-testid="button-skip-match-intro"
            aria-label="Skip match introduction"
          >
            SKIP
          </button>
        ) : null}
      </main>
    </div>
  );
}
