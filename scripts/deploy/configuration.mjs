/** The approval lives in Render settings, outside the source being built. */
export function protectedBuildCommand(role, approvedCommit) {
  if (!/^[0-9a-f]{40}$/.test(approvedCommit))
    throw Error("Invalid approved production revision.");
  const target = { api: "@workspace/api-server", front: "@workspace/ko-game" }[
    role
  ];
  if (!target) throw Error("Unknown production service.");
  return `node -e "if(process.env.RENDER_GIT_COMMIT!=='${approvedCommit}'){console.error('UNAPPROVED PRODUCTION REVISION');process.exit(1)}" && pnpm install --frozen-lockfile && pnpm --filter ${target} build`;
}
export function productionSettings(role, approvedCommit) {
  const buildCommand = protectedBuildCommand(role, approvedCommit);
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
