export function protectedBuildCommand(role, minimumCommit) {
  if (!/^[0-9a-f]{40}$/.test(minimumCommit))
    throw Error("Invalid minimum production revision.");
  const target = { api: "@workspace/api-server", front: "@workspace/ko-game" }[
    role
  ];
  if (!target) throw Error("Unknown production service.");
  return `node scripts/deploy/verify-release.mjs --minimum-commit ${minimumCommit} && pnpm install --frozen-lockfile && pnpm --filter ${target} build`;
}
export function productionSettings(role, minimumCommit) {
  const buildCommand = protectedBuildCommand(role, minimumCommit);
  return {
    branch: "production",
    autoDeploy: "no",
    serviceDetails:
      role === "api"
        ? {
            envSpecificDetails: {
              buildCommand,
              startCommand: "pnpm --filter @workspace/api-server start",
            },
          }
        : { buildCommand },
  };
}
