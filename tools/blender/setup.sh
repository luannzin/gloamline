#!/usr/bin/env bash
# What survivor.py needs besides Blender, fetched into tools/blender/out (gitignored):
#   - MPFB (the MakeHuman add-on, GPL; the bodies it makes are CC0), installed into a Blender profile
#     of its own, so your own Blender is left as it was
#   - the CMU motion capture clips it retargets (free for any use: mocap.cs.cmu.edu; BVH conversion
#     by Bruce Hahne)
# Then build with:
#   BLENDER_USER_RESOURCES="$PWD/tools/blender/out/blender-user" \
#     blender -b -t 4 --python tools/blender/survivor.py -- apps/client/public/models/survivor.glb
set -euo pipefail
cd "$(dirname "$0")"
BLENDER=${BLENDER:-blender}
mkdir -p out/blender-user out/cmu
BLENDER_USER_RESOURCES="$PWD/out/blender-user" "$BLENDER" --online-mode -c extension install -s -e mpfb

# subject/clip: what each is for (survivor.py)
for clip in 016/16_15 016/16_45 008/08_04 077/77_02 079/79_68; do
  name=$(basename "$clip")
  [ -s "out/cmu/$name.bvh" ] ||
    curl -sfL "https://raw.githubusercontent.com/sfd158/cmu-mocap/master/data/$clip.bvh" -o "out/cmu/$name.bvh"
done
echo "ready: MPFB in out/blender-user, clips in out/cmu"
