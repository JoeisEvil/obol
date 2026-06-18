#!/bin/bash
set -e
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
SKILLS_DIR="$HERMES_HOME/skills"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "Installing LEDGER skills into $SKILLS_DIR ..."

for skill in sentinel comptroller treasurer forecaster company-registry; do
  mkdir -p "$SKILLS_DIR/$skill"
  cp "$PROJECT_DIR/hermes/skills/$skill/SKILL.md" "$SKILLS_DIR/$skill/"
  echo "  ✓ $skill"
done

echo ""
echo "Installing SOUL.md and MEMORY.md..."
cp "$PROJECT_DIR/hermes/SOUL.md" "$HERMES_HOME/SOUL.md"
cp "$PROJECT_DIR/hermes/MEMORY.md" "$HERMES_HOME/MEMORY.md"
echo "  ✓ SOUL.md"
echo "  ✓ MEMORY.md"

echo ""
echo "Next steps:"
echo "1. Set model: hermes config set model nvidia:nemotron-3-ultra"
echo "2. Add the MCP server to $HERMES_HOME/config.yaml:"
echo ""
echo "   mcp_servers:"
echo "     - name: ledger-core"
echo "       command: bun"
echo "       args: [\"$PROJECT_DIR/mcp/ledger-core/index.ts\"]"
echo "       env:"
echo "         LEDGER_MODE: \"mock\""
echo "         MCP_HTTP_PORT: \"3001\""
echo "         STRIPE_KEY_LEDGER_SAAS: \"\${STRIPE_KEY_LEDGER_SAAS}\""
echo "         STRIPE_KEY_UNIT_ALPHA: \"\${STRIPE_KEY_UNIT_ALPHA}\""
echo "         LEDGER_ENCRYPT_KEY: \"\${LEDGER_ENCRYPT_KEY}\""
echo ""
echo "3. Seed demo data:  bun $PROJECT_DIR/scripts/seed-demo-data.ts"
echo "4. hermes restart"
echo "5. hermes chat  →  say 'list companies' then 'run portfolio check'"
