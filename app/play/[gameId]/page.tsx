import GamePlayground from "./playground";

export default async function PlayPage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  return <GamePlayground gameId={gameId} />;
}
