/// Room board order, best first.
///
/// Points alone tie constantly. STAGE_BASE is six fixed values (see
/// lib/game/scoring/v1.ts), so two players who solved the same rounds off the
/// same rungs finish dead level — in a 5-round game a four-way tie on points is
/// an ordinary result, not an edge case, and sorting on score alone left those
/// four in whatever order the row fetch happened to return.
///
/// The chain after score answers "who did it on less information":
///
///   1. score              — more points wins outright
///   2. stageOneSolves     — more songs named off the 0.4s clip, the hardest rung
///   3. roundsSolved       — more songs named at all
///   4. seatIndex          — nothing left to separate them; pick a STABLE order
///                           so the board doesn't reshuffle between renders
///
/// Rung 1 before songs-solved is deliberate: a player who took four songs off
/// 0.4s heard less audio than one who took five off the 2.2s clip for the same
/// points, and the game's whole premise is how little you need to hear.
///
/// MIRRORED by compareStandings in the backend's src/socket-handler.ts, which
/// orders the final table. The live board is sorted here, so the two
/// disagreeing would visibly swap the leader at `game:end`.
export function compareStandings(
  a: { score: number; stageOneSolves: number; roundsSolved: number; seatIndex: number },
  b: { score: number; stageOneSolves: number; roundsSolved: number; seatIndex: number },
): number {
  return (
    b.score - a.score ||
    b.stageOneSolves - a.stageOneSolves ||
    b.roundsSolved - a.roundsSolved ||
    a.seatIndex - b.seatIndex
  );
}

/// Whether `player` is level on points with anyone else on the board — the
/// condition under which the tie-break is what put them where they are, and so
/// the only time it is worth showing in the UI.
export function isTiedOnScore(
  player: { score: number },
  board: readonly { score: number }[],
): boolean {
  return board.filter((p) => p.score === player.score).length > 1;
}
