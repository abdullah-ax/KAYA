#!/usr/bin/env sh
# Installs a pre-push hook: pushes to main are blocked unless precheck and tests pass.
# Run once per clone: sh scripts/install_hooks.sh
set -e
HOOK=.git/hooks/pre-push
cat > "$HOOK" <<'EOF'
#!/usr/bin/env sh
while read local_ref local_sha remote_ref remote_sha; do
  case "$remote_ref" in
    refs/heads/main)
      echo "Pushing to main: running precheck and tests..."
      python3 scripts/precheck.py || { echo "Blocked: fix the errors above before pushing to main."; exit 1; }
      python3 -m pytest -q tests || { echo "Blocked: tests failed."; exit 1; }
      ;;
  esac
done
exit 0
EOF
chmod +x "$HOOK"
echo "pre-push hook installed"
