import bpy
import sys

print("Installing VRM extension...")

# Try to install VRM extension from Blender Extensions
try:
    # Use Blender's extension system to install VRM
    bpy.ops.preferences.extension_repo_sync_all()
    print("Synced extension repositories")

    # Install the VRM extension
    bpy.ops.preferences.extension_install(repo_index=0, pkg_id="vrm")
    print("VRM extension installed successfully")

except Exception as e:
    print(f"Could not install via extension system: {e}")
    print("VRM addon installation will be attempted at runtime")

# Save preferences
try:
    bpy.ops.wm.save_userpref()
    print("Preferences saved")
except Exception as e:
    print(f"Could not save preferences: {e}")

sys.exit(0)
