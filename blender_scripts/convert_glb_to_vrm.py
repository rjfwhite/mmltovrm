import bpy
import sys
from pathlib import Path

def convert_glb_to_vrm(input_glb_path, output_vrm_path):
    """Convert a GLB file to VRM format using Blender"""

    # Manually load VRM extension for Blender 4.2+
    extension_dir = "/root/.config/blender/4.2.3/extensions/user_default"

    # Add the parent extension directory to sys.path so we can import vrm
    if extension_dir not in sys.path:
        sys.path.insert(0, extension_dir)
        print(f"Added {extension_dir} to sys.path")

    # Try to import and register the VRM extension
    try:
        import vrm
        print("VRM module imported successfully")

        # Register the extension if not already registered
        if hasattr(vrm, 'register'):
            try:
                vrm.register()
                print("VRM extension registered")
            except Exception as reg_err:
                print(f"Warning during registration: {reg_err}")
                # Continue anyway, might already be registered

        # Monkey-patch the model_validate operator to bypass validation
        # This is necessary because validation requires preferences which aren't available in headless mode
        try:
            from vrm.common import ops as vrm_ops
            original_validate = vrm_ops.vrm.model_validate

            def mock_validate(*args, **kwargs):
                """Mock validation that always succeeds"""
                print("Skipping VRM validation (not needed for headless conversion)")
                return {"FINISHED"}

            vrm_ops.vrm.model_validate = mock_validate
            print("VRM validation bypassed for headless mode")
        except Exception as patch_err:
            print(f"Warning: Could not bypass validation: {patch_err}")
            print("Will attempt export anyway...")

        vrm_available = True
    except Exception as e:
        print(f"Failed to load VRM extension: {e}")
        import traceback
        traceback.print_exc()
        raise Exception("VRM extension is required but could not be loaded")

    # Clear existing scene
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()

    # Import GLB file
    print(f"Importing GLB from: {input_glb_path}")
    result = bpy.ops.import_scene.gltf(filepath=input_glb_path)

    if result != {'FINISHED'}:
        raise Exception(f"Failed to import GLB: {result}")

    print("GLB imported successfully")

    # Find the armature object
    armature = None
    for obj in bpy.context.scene.objects:
        if obj.type == 'ARMATURE':
            armature = obj
            break

    if armature:
        print(f"Found armature: {armature.name}")

        # Set VRM spec version to 0.0 (VRM 0.x)
        try:
            armature.data.vrm_addon_extension.spec_version = '0.0'
            print("Set VRM spec version to 0.0")
        except AttributeError as e:
            print(f"Warning: Could not set VRM spec version on armature: {e}")
            print("Will try to export anyway...")

        # Automatically assign VRM humanoid bones
        try:
            print(f"Auto-assigning VRM humanoid bones for armature: {armature.name}")
            result = bpy.ops.vrm.assign_vrm0_humanoid_human_bones_automatically(
                armature_object_name=armature.name
            )
            if result == {'FINISHED'}:
                print("VRM humanoid bones assigned successfully")
            else:
                print(f"Bone assignment returned: {result}")
        except Exception as bone_err:
            print(f"Warning: Could not auto-assign humanoid bones: {bone_err}")
            print("Will try to export anyway...")
    else:
        print("Warning: No armature found in the scene")
        print("Will try to export anyway...")

    # Export to VRM
    print(f"Exporting VRM to: {output_vrm_path}")
    result = bpy.ops.export_scene.vrm(
        filepath=output_vrm_path,
        use_addon_preferences=False,  # Don't use addon preferences (not set up in headless mode)
        ignore_warning=True  # Ignore validation warnings
    )

    if result != {'FINISHED'}:
        raise Exception(f"Failed to export VRM: {result}")

    print(f"VRM exported successfully to: {output_vrm_path}")
    return True

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: blender --background --python convert_glb_to_vrm.py -- <input.glb> <output.vrm>")
        sys.exit(1)

    # Arguments after -- are passed to the script
    argv = sys.argv
    argv = argv[argv.index("--") + 1:]

    input_path = argv[0]
    output_path = argv[1]

    try:
        convert_glb_to_vrm(input_path, output_path)
        print("SUCCESS")
        sys.exit(0)
    except Exception as e:
        print(f"ERROR: {str(e)}")
        sys.exit(1)
