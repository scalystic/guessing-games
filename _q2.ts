import "dotenv/config";
import { prisma } from "@/lib/db";
async function main(){
const rows: any[] = await prisma.$queryRawUnsafe(`
  SELECT count(*)::int total,
         count(*) FILTER (WHERE s."externalId" IS NOT NULL)::int withvid,
         count(*) FILTER (WHERE s."isLocked")::int locked,
         count(*) FILTER (WHERE p."isActive" AND NOT p."isBlocked")::int active,
         count(*) FILTER (WHERE p."isActive" AND NOT p."isBlocked" AND s."externalId" IS NOT NULL AND s."isLocked")::int fully
  FROM "DailyChallengePuzzle" d
  JOIN "Puzzle" p ON p.id = d."puzzleId"
  LEFT JOIN "Song" s ON s."puzzleId" = p.id
  WHERE d."dailyChallengeId" = $1`, 'cmucp3uox0000b0kapcejfope');
console.log(rows[0]);
const idx: any[] = await prisma.$queryRawUnsafe(`SELECT min("roundIndex")::int lo, max("roundIndex")::int hi, count(*)::int n FROM "DailyChallengePuzzle" WHERE "dailyChallengeId"=$1`, 'cmucp3uox0000b0kapcejfope');
console.log(idx[0]);
await prisma.$disconnect();
}
main();
