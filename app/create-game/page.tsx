import GameCreator from "./game-creator";

export default async function CreateGamePage({ searchParams }: PageProps<"/create-game">) {
  const params = await searchParams;
  const mode = params.mode === "multiplayer" || params.room ? "multiplayer" : "single_player";
  const title = typeof params.title === "string" ? params.title.slice(0, 120) : "My brilliant game";
  const roomId = typeof params.room === "string" ? params.room : undefined;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const savedGame = mode === "multiplayer" && typeof params.resumeGame === "string" && uuid.test(params.resumeGame) && typeof params.resumeVersion === "string" && uuid.test(params.resumeVersion)
    ? { gameId: params.resumeGame, versionId: params.resumeVersion }
    : undefined;
  return <GameCreator key={savedGame?.versionId ?? `${mode}:${roomId ?? ""}:${title}`} mode={mode} title={title} roomId={roomId} savedGame={savedGame} />;
}
