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
LIVE_WINDOW=5400        # a workflow is only "live" if an agent wrote within 90 min

last_beat=0

while true; do
  now=$(date +%s)

  # --- are any LIVE workflows still owed results? ---
  #
  # "Live" matters. Abandoned runs keep their journals forever with started > result,
  # so counting every journal on disk would fire a permanent false stall. A workflow is
  # only considered live if one of its own agent transcripts was written recently; an
  # older one is finished history, however incomplete it looks.
  incomplete=0
  detail=""
  for j in "$WF"/*/journal.jsonl; do
    [ -f "$j" ] || continue
    dir=$(dirname "$j")

    recent=$(find "$dir" -name 'agent-*.jsonl' -newermt "-${LIVE_WINDOW} seconds" 2>/dev/null | head -1)
    [ -n "$recent" ] || continue

    s=$(grep -c '"type":"started"' "$j" 2>/dev/null); s=${s:-0}
    r=$(grep -c '"type":"result"' "$j" 2>/dev/null); r=${r:-0}
    if [ "$s" -gt "$r" ] 2>/dev/null; then
      incomplete=1
      detail="$detail $(basename "$dir")=$r/$s"
    fi
  done

  # --- when did any agent in a LIVE workflow last write? ---
  newest=$(find "$WF" -name 'agent-*.jsonl' -newermt "-${LIVE_WINDOW} seconds" -printf '%T@\n' 2>/dev/null \
           | sort -n | tail -1 | cut -d. -f1)
  if [ -n "$newest" ]; then
    age=$(( now - newest ))
  else
    age=0
  fi

  if [ "$incomplete" -eq 1 ] && [ "$age" -gt "$STALL_SECONDS" ]; then
    echo "STALL: agents outstanding ($detail ) but no transcript write for $((age/60))m"
  fi

  # --- self-heal: sweep vite servers old enough to be orphans ---
  orph=$(ps -eo pid,etimes,args | awk '$2 > 3600 && $0 ~ /vite (preview )?--port/' | wc -l)
  if [ "$orph" -gt 0 ]; then
    ps -eo pid,etimes,args | awk '$2 > 3600 && $0 ~ /vite (preview )?--port/ {print $1}' | xargs -r kill -9 2>/dev/null
    echo "SWEPT $orph orphaned vite server(s) older than 1h - the failure mode that stalled the last run"
  fi

  # --- a held port is the specific thing that kills agents; report it early ---
  for p in 5178 5179 5188 5191; do
    if ! (exec 3<>/dev/tcp/127.0.0.1/$p) 2>/dev/null; then :; else
      exec 3<&- 2>/dev/null
      owner=$(ps -eo pid,etimes,args | awk -v P=":$p" '$0 ~ /vite/ && $0 ~ P {print $2; exit}')
      [ -n "$owner" ] && [ "$owner" -gt 1800 ] && echo "WARN: port $p held by a vite server ${owner}s old"
    fi
  done

  if [ $(( now - last_beat )) -gt "$BEAT_SECONDS" ]; then
    if [ "$incomplete" -eq 1 ]; then
      echo "heartbeat: agents working ($detail ), last write $((age/60))m ago"
    else
      echo "heartbeat: no agents outstanding"
    fi
    last_beat=$now
  fi

  sleep "$POLL"
done
