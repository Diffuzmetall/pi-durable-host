#!/bin/sh
# curl + Node JSON handling; no SDK or Durable imports. Do not enable shell tracing with credentials.
set -eu
: "${DPI_URL:?Set DPI_URL}" "${DPI_TOKEN:?Set DPI_TOKEN}" "${DPI_CWD:?Set DPI_CWD}"
: "${DPI_REQUEST_KEY:?Set a persisted DPI_REQUEST_KEY}" "${DPI_MODEL_PROVIDER:?Set DPI_MODEL_PROVIDER}" "${DPI_MODEL_ID:?Set DPI_MODEL_ID}"
[ "${#DPI_REQUEST_KEY}" -le 110 ] || { printf '%s\n' 'Request key too long' >&2; exit 1; }
base=${DPI_URL%/}
request() {
  # Credential on stdin, not in curl command-line arguments. Response bodies never enter diagnostics.
  if [ "$#" -eq 1 ]; then
    printf 'Authorization: Bearer %s\n' "$DPI_TOKEN" | curl --silent --fail --max-time 35 --header @- "$base$1"
  else
    printf 'Authorization: Bearer %s\n' "$DPI_TOKEN" | curl --silent --fail --max-time 35 --header @- --header "Idempotency-Key: $3" --json "$2" "$base$1"
  fi
}
protocol=$(request /v1/protocol) || { printf '%s\n' 'Host unavailable' >&2; exit 1; }
printf '%s' "$protocol" | node -e 'const p=JSON.parse(require("fs").readFileSync(0,"utf8"));if(p.apiVersion!==1||!Array.isArray(p.capabilities)||!p.capabilities.every(x=>typeof x==="string"))process.exit(1)' || { printf '%s\n' 'Incompatible host protocol' >&2; exit 1; }
body=$(node -e 'console.log(JSON.stringify({name:"curl recipe",cwd:process.env.DPI_CWD,model:{provider:process.env.DPI_MODEL_PROVIDER,modelId:process.env.DPI_MODEL_ID}}))')
session=$(request /v1/sessions "$body" "$DPI_REQUEST_KEY:session") || { printf '%s\n' 'Session create failed; keep the same key' >&2; exit 1; }
session_id=$(printf '%s' "$session" | node -e 'const v=JSON.parse(require("fs").readFileSync(0,"utf8"));if(typeof v.id!=="string"||!v.id)process.exit(1);process.stdout.write(encodeURIComponent(v.id))')
body=$(node -e 'console.log(JSON.stringify({content:process.env.DPI_PROMPT??"Hello from curl recipe",whenBusy:"followUp",requestId:process.env.DPI_REQUEST_KEY+":submit"}))')
sent=$(request "/v1/sessions/$session_id/agents/main/messages" "$body" "$DPI_REQUEST_KEY:submit") || { printf '%s\n' 'Submission uncertain; retry unchanged inputs and key' >&2; exit 1; }
submission_id=$(printf '%s' "$sent" | node -e 'const v=JSON.parse(require("fs").readFileSync(0,"utf8"));if(!Number.isSafeInteger(v.submissionId)||v.submissionId<=0)process.exit(1);process.stdout.write(String(v.submissionId))')
encoded_key=$(node -e 'process.stdout.write(encodeURIComponent(process.env.DPI_REQUEST_KEY+":submit"))')
receipt=$(request "/v1/sessions/$session_id/agents/main/receipts/$encoded_key") || { printf '%s\n' 'Receipt unavailable; do not generate another key' >&2; exit 1; }
printf '%s' "$receipt" | RECIPE_SUBMISSION_ID="$submission_id" node -e 'const v=JSON.parse(require("fs").readFileSync(0,"utf8"));if(v.submissionId!==Number(process.env.RECIPE_SUBMISSION_ID))process.exit(1)'
result=$(request "/v1/sessions/$session_id/submissions/$submission_id?waitMs=30000") || { printf '%s\n' 'Result unavailable; retry with the same key' >&2; exit 1; }
printf '%s' "$result" | RECIPE_SESSION_ID="$session_id" node -e 'const v=JSON.parse(require("fs").readFileSync(0,"utf8"));if(v.status!=="done"||typeof v.answer?.text!=="string"){console.error("No terminal answer yet; retry unchanged inputs and key");process.exit(1)}console.log(JSON.stringify({sessionId:decodeURIComponent(process.env.RECIPE_SESSION_ID),submissionId:v.submissionId,status:v.status,answer:v.answer.text}))'
