#!/usr/bin/env bash
set -euo pipefail

blog_dir=${BLOG_DIR:-/home/Blog}
legacy_dir=${LEGACY_DIR:-/home/legacy}
remote=https://github.com/BennyThink/bennythink.github.io.git
export GIT_TERMINAL_PROMPT=0

mkdir -p "$legacy_dir"
exec 9>"$legacy_dir/.sync.lock"
flock -n 9 || exit 0

if [[ -d "$legacy_dir/.git" || -f "$legacy_dir/.git" ]]; then
  repo_dir=$legacy_dir
else
  repo_dir="$legacy_dir/bennythink.github.io"
fi
if [[ ! -e "$repo_dir/.git" ]]; then
  git clone --branch master "$remote" "$repo_dir"
fi
case "$(git -C "$repo_dir" remote get-url --push origin)" in
  https://github.com/BennyThink/bennythink.github.io|https://github.com/BennyThink/bennythink.github.io.git|git@github.com:BennyThink/bennythink.github.io|git@github.com:BennyThink/bennythink.github.io.git|ssh://git@github.com/BennyThink/bennythink.github.io.git) ;;
  *) echo "Unexpected archive repository origin: $repo_dir" >&2; exit 1 ;;
esac
if [[ "$(git -C "$repo_dir" branch --show-current)" != master ]] ||
   [[ -n "$(git -C "$repo_dir" status --porcelain --untracked-files=no)" ]]; then
  echo "Expected a clean archive checkout on master: $repo_dir" >&2
  exit 1
fi

cd "$blog_dir"
stage=$(mktemp -d)
container_dir="/tmp/dmesg-legacy-${stage##*/}"
cleanup() {
  docker compose exec -T emdash rm -rf -- "$container_dir" >/dev/null 2>&1 || true
  rm -rf -- "$stage"
}
trap cleanup EXIT

docker compose exec -T -e "LEGACY_ASSET_ORIGINS=${LEGACY_ASSET_ORIGINS:-}" emdash \
  sh -c 'mkdir -- "$1" && npm run export:legacy -- --output "$1/site"' sh "$container_dir"
docker compose cp "emdash:$container_dir/site" "$stage/site"
test -s "$stage/site/index.html"

git -C "$repo_dir" pull --ff-only origin master
archive="$repo_dir/emdash"
if [[ -L "$archive" ]]; then
  echo "Archive destination is a symbolic link: $archive" >&2
  exit 1
fi
if [[ -n "$(git -C "$repo_dir" ls-files --others -- emdash .nojekyll)" ]]; then
  echo "Found untracked files in the archive destination: $repo_dir" >&2
  exit 1
fi
mkdir -p "$archive"
rsync -a --delete -- "$stage/site/" "$archive/"
# The repository contains generated HTML, including directories beginning with "_".
touch "$repo_dir/.nojekyll"
git -C "$repo_dir" add -f -A -- emdash .nojekyll
if ! git -C "$repo_dir" diff --cached --quiet -- emdash .nojekyll; then
  git -C "$repo_dir" commit -m "Update EmDash archive" -- emdash .nojekyll
fi
# Also retry pushing a commit left behind by a failed push.
git -C "$repo_dir" push origin master
