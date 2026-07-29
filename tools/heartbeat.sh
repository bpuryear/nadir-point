#!/usr/bin/env bash
# Agent watchdog.
#
# Two jobs, because the five-hour outage needed both:
#   1. DETECT a silent stall - workflows that still have agents outstanding but have
#      stopped writing to their transcripts. A hung agent looks identical to a busy one
#      unless you watch the clock.
#   2. HEAL the known cause - orphaned vite servers holding ports. The harness now
#      avoids creating them and moves off a taken port, but anything spawned before that
#      fix, or by a process that died hard, still needs sweeping.
#
# Emits a line only when something is wrong, plus an hourly heartbeat so that silence
# from this script is itself distinguishable from silence from the agents.

WF="/root/.claude/projects/-home-user-nadir-point/b4b215f7-9140-591b-bb31-5a58490310d7/subagents/workflows"
STALL_SECONDS=1500     # 25 min with agents outstanding and no transcript write
BEAT_SECONDS=3600      # positive confirmation once an hour
POLL=120
LIVE_WINDOW=3600        # a workflow is only "live" if an agent wrote within 60 min
ALERTED="/tmp/nadir-heartbeat-alerted"   # one alert per workflow, not one per poll

last_beat=0

while true; do
  now=$(date +%s)

  # --- are any LIVE workflows still owed results? ---
  #
  # "Live" matters. Abandoned runs keep their journals forever with started > result,
  # so counting every journal on disk would fire a permanent false stall. A workflow is
  # only considered live if one of its own agent transcripts was written recently; an
  # older one is finished history, however incomplete it looks.
  # Staleness is measured PER WORKFLOW, not across all of them. Comparing the newest
  # write anywhere would let one hung workflow hide behind a busy one - which is
  # precisely the shape of the outage this script exists to catch, since the art pass
  # was writing happily while two other waves were dead.
  incomplete=0
  detail=""
  oldest_live_age=0
  for j in "$WF"/*/journal.jsonl; do
    [ -f "$j" ] || continue
    dir=$(dirname "$j")
    name=$(basename "$dir")

    recent=$(find "$dir" -name 'agent-*.jsonl' -newermt "-${LIVE_WINDOW} seconds" 2>/dev/null | head -1)
    [ -n "$recent" ] || continue

    s=$(grep -c '"type":"started"' "$j" 2>/dev/null); s=${s:-0}
    r=$(grep -c '"type":"result"' "$j" 2>/dev/null); r=${r:-0}
    [ "$s" -gt "$r" ] 2>/dev/null || continue

    incomplete=1
    wf_newest=$(find "$dir" -name 'agent-*.jsonl' -printf '%T@\n' 2>/dev/null | sort -n | tail -1 | cut -d. -f1)
    wf_age=0
    [ -n "$wf_newest" ] && wf_age=$(( now - wf_newest ))
    detail="$detail $name=$r/$s@$((wf_age/60))m"
    [ "$wf_age" -gt "$oldest_live_age" ] && oldest_live_age=$wf_age

    # Alert ONCE per workflow. A run that finished with an agent error looks exactly
    # like a hung one from here - it stops writing and its journal keeps started > result
    # forever, because an errored agent never emits a result line. Re-alerting every poll
    # would bury a real stall in noise from a run that is simply over, which is the
    # fastest way to train someone to ignore the alarm.
    if [ "$wf_age" -gt "$STALL_SECONDS" ] && ! grep -qxF "$name" "$ALERTED" 2>/dev/null; then
      echo "STALL: $name has $((s-r)) agent(s) outstanding and has not written for $((wf_age/60))m — hung, or finished with an agent error"
      echo "$name" >> "$ALERTED"
    fi
  done
  age=$oldest_live_age

  # --- self-heal: sweep genuinely orphaned vite servers ---
  #
  # The test is PARENTAGE, not age. A vite server whose PPID is 1 has been reparented to
  # init because the harness that spawned it is gone, so nobody is reading from it and it
  # is only holding a port. That is true at one minute as much as at one hour.
  #
  # Age was the original filter and it was a proxy for the wrong thing: it left young
  # orphans accumulating (18 of them at one point) while a legitimately busy server that
  # happened to be old was equally at risk. Parentage is exact in both directions —
  # a server with a live parent is never touched, whatever its age.
  orph=$(ps -eo pid,ppid,args | awk '$2 == 1 && $0 ~ /vite (preview )?--port/' | wc -l)
  if [ "$orph" -gt 0 ]; then
    ps -eo pid,ppid,args | awk '$2 == 1 && $0 ~ /vite (preview )?--port/ {print $1}' | xargs -r kill -9 2>/dev/null
    echo "SWEPT $orph vite server(s) reparented to init - abandoned by a dead harness"
  fi

  # A per-port "is it held" check lived here and was removed. It matched ":5179"
  # against args that actually read "--port 5179", so it reported an unrelated process
  # and printed a 130-year-old server. It was also redundant: a busy agent legitimately
  # holds ports, so the only genuinely bad case is a server old enough to be an orphan,
  # and the sweep above already kills those. The harness itself now moves off a taken
  # port rather than inheriting it, which is the real fix.

  if [ $(( now - last_beat )) -gt "$BEAT_SECONDS" ]; then
    if [ "$incomplete" -eq 1 ]; then
      # `age` is the OLDEST live workflow, not the newest write. Saying "last write"
      # made a healthy run look stale: with one finished-with-error workflow sitting at
      # 48m and two others writing continuously, the summary read "last write 48m ago".
      # The per-workflow ages in $detail are the real signal.
      echo "heartbeat: agents working ($detail ), stalest $((age/60))m"
    else
      echo "heartbeat: no agents outstanding"
    fi
    last_beat=$now
  fi

  sleep "$POLL"
done
