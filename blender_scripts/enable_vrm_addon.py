import bpy

# Enable the VRM addon (built-in for Blender 4.2+)
addon_name = "vrm"

# Enable the addon
bpy.ops.preferences.addon_enable(module=addon_name)

# Save preferences
bpy.ops.wm.save_userpref()

print(f"VRM addon enabled successfully")
