import "dotenv/config";
import { prisma } from "@/lib/db";
async function main() {
const games = await prisma.game.findMany({ select: { id:true, slug:true, livesPerRun:true, maxAttempts:true, isActive:true }});
console.log('GAMES', games);
for (const g of games) {
  const el: any[] = await prisma.$queryRawUnsafe(`SELECT count(*)::int n FROM "Puzzle" p JOIN "Song" s ON s."puzzleId"=p.id WHERE p."gameId"=$1 AND p."isActive"=true AND p."isBlocked"=false AND s."externalId" IS NOT NULL AND s."isLocked"=true`, g.id);
  const tot: any[] = await prisma.$queryRawUnsafe(`SELECT count(*)::int n, count(*) FILTER (WHERE s."isLocked")::int locked, count(*) FILTER (WHERE s."externalId" IS NOT NULL)::int withvid, count(*) FILTER (WHERE p."isActive" AND NOT p."isBlocked")::int active FROM "Puzzle" p JOIN "Song" s ON s."puzzleId"=p.id WHERE p."gameId"=$1`, g.id);
  console.log(g.slug, 'eligible', el[0].n, 'breakdown', tot[0]);
}
const ch = await prisma.dailyChallenge.findMany({ orderBy:{dayKey:'desc'}, take:6, select:{id:true,dayKey:true,title:true,roundCount:true,publishedAt:true,gameId:true,_count:{select:{entries:true}}}});
console.log('CHALLENGES', JSON.stringify(ch,null,1));
const runs = await prisma.run.findMany({ where: { mode: 'DAILY' }, orderBy: { startedAt: 'desc' }, take: 5, select: { id:true, dayKey:true, maxRounds:true, status:true, livesRemaining:true, currentRoundIndex:true, roundsSolved:true, _count:{select:{rounds:true}} }});
console.log('RECENT DAILY RUNS', JSON.stringify(runs,null,1));
await prisma.$disconnect();
}
main();
