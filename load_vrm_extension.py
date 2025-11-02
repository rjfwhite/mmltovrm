import bpy
import sys

# For Blender 4.2+, manually load the VRM extension
extension_path = "/root/.config/blender/4.2.3/extensions/user_default/vrm"

# Add the extension path to sys.path
if extension_path not in sys.path:
    sys.path.append(extension_path)
    print(f"Added {extension_path} to sys.path")

# Try to import and register the VRM extension
try:
    import vrm
    print("VRM module imported successfully")

    # Register the extension
    if hasattr(vrm, 'register'):
        vrm.register()
        print("VRM extension registered successfully")
    else:
        print("Warning: VRM module has no register function")

except Exception as e:
    print(f"Failed to load VRM extension: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

print("VRM extension loaded and ready to use")
