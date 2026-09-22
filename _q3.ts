import "dotenv/config";
import { prisma } from "@/lib/db";
import { countDailyChallengeRounds, dailyPuzzleAt } from "@/lib/game/daily-selection";
const CH = 'cmucp3uox0000b0kapcejfope';
async function main(){
  const n = await countDailyChallengeRounds(CH);
  console.log('rounds =', n);
  const admin = await prisma.dailyChallengePuzzle.findMany({ where:{dailyChallengeId:CH}, orderBy:{roundIndex:'asc'}, select:{roundIndex:true,puzzleId:true, puzzle:{select:{song:{select:{title:true}}}}}});
  const seen = new Set<string>();
  let ok = true;
  for (let i=1;i<=n+1;i++){
    const p = await dailyPuzzleAt({dailyChallengeId:CH, position:i});
    if (i<=n){
      if(!p){ console.log('MISSING at', i); ok=false; continue; }
      if(p.puzzleId !== admin[i-1].puzzleId){ console.log('ORDER MISMATCH at', i); ok=false; }
      if(seen.has(p.puzzleId)) { console.log('DUPLICATE at', i); ok=false; }
      seen.add(p.puzzleId);
      if(!p.youtubeVideoId){ console.log('NO VIDEO at', i); ok=false; }
      if(i<=3||i>=n-1) console.log(i, admin[i-1].puzzle.song?.title, p.youtubeVideoId, 'hook', p.hookStartMs);
    } else {
      console.log('position', i, '=>', p===null ? 'null (run completes) OK' : 'UNEXPECTED '+p.puzzleId);
      if(p!==null) ok=false;
    }
  }
  console.log('distinct songs playable:', seen.size, ok ? 'ALL GOOD' : 'PROBLEMS');
  await prisma.$disconnect();
}
main();
