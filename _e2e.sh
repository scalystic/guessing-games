set -e
J=/tmp/claude-1000/-home-ptspl19-Desktop-git-projects-SaaS-cluecade/8d76b115-b842-4f46-bf41-7c5f1a87bbdc/scratchpad/jar.txt
rm -f $J
START=$(curl -s -c $J -H 'content-type: application/json' -d '{"gameSlug":"songless","mode":"DAILY"}' http://localhost:3000/api/runs)
echo "$START" > /tmp/claude-1000/-home-ptspl19-Desktop-git-projects-SaaS-cluecade/8d76b115-b842-4f46-bf41-7c5f1a87bbdc/scratchpad/start.json
echo "START: $START" | head -c 600; echo
RUN=$(echo "$START" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log((j.data??j).runId)})")
TOK=$(echo "$START" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log((j.data??j).runToken)})")
echo "runId=$RUN"
for i in $(seq 1 80); do
  R=$(curl -s -b $J -H "authorization: Bearer $TOK" -H 'content-type: application/json' -d "{\"idempotencyKey\":\"e2e-key-$i-abcdefgh\"}" http://localhost:3000/api/runs/$RUN/giveup)
  echo "$R" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);const r=(j.data??j).result??(j.data??j);console.log(process.argv[1], 'round', r.roundIndex, 'status', r.runStatus, 'lives', r.livesRemaining, 'next', r.youtubeVideoId)})" $i
  if echo "$R" | grep -q '"runStatus":"COMPLETED"'; then echo "COMPLETED after $i rounds"; break; fi
done
echo "$RUN" > /tmp/claude-1000/-home-ptspl19-Desktop-git-projects-SaaS-cluecade/8d76b115-b842-4f46-bf41-7c5f1a87bbdc/scratchpad/runid.txt
