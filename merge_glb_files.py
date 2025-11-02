import bpy
import sys
from pathlib import Path

def merge_glb_files(base_glb_path, additional_glb_paths, output_path):
    """
    Merge multiple GLB files in Blender, combining meshes onto the base skeleton.
    This moves meshes from additional GLBs into the base scene and reassigns them
    to use the base armature.
    """

    # Clear the scene
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()

    # Import base GLB
    print(f"Importing base GLB: {base_glb_path}")
    bpy.ops.import_scene.gltf(filepath=base_glb_path)

    # Find the base armature
    base_armature = None
    for obj in bpy.context.scene.objects:
        if obj.type == 'ARMATURE':
            base_armature = obj
            break

    if not base_armature:
        raise Exception("No armature found in base GLB")

    print(f"Base armature: {base_armature.name}")

    # Store base objects to identify new ones later
    base_objects = set(bpy.context.scene.objects)
    base_mesh_count = len([obj for obj in base_objects if obj.type == 'MESH'])
    print(f"Base has {base_mesh_count} meshes")

    # Import each additional GLB and merge its meshes
    for i, glb_path in enumerate(additional_glb_paths):
        print(f"\nImporting additional GLB {i+1}/{len(additional_glb_paths)}: {glb_path}")

        # Remember objects before import
        objects_before = set(bpy.context.scene.objects)

        # Import the additional model
        bpy.ops.import_scene.gltf(filepath=glb_path)

        # Find newly imported objects
        new_objects = set(bpy.context.scene.objects) - objects_before
        new_meshes = [obj for obj in new_objects if obj.type == 'MESH']
        new_armatures = [obj for obj in new_objects if obj.type == 'ARMATURE']

        print(f"  Found {len(new_meshes)} new meshes, {len(new_armatures)} new armatures")

        # Process each new mesh
        for mesh_obj in new_meshes:
            print(f"  Processing mesh: {mesh_obj.name}")

            # Clear parent (we'll reparent to base armature)
            mesh_obj.parent = None
            mesh_obj.matrix_parent_inverse.identity()

            # Remove any existing armature modifiers
            for mod in list(mesh_obj.modifiers):
                if mod.type == 'ARMATURE':
                    print(f"    Removing old armature modifier")
                    mesh_obj.modifiers.remove(mod)

            # Add new armature modifier pointing to base armature
            if len(mesh_obj.vertex_groups) > 0:
                print(f"    Adding armature modifier for base armature")
                arm_mod = mesh_obj.modifiers.new(name="Armature", type='ARMATURE')
                arm_mod.object = base_armature

                # Parent to base armature
                mesh_obj.parent = base_armature
                mesh_obj.parent_type = 'ARMATURE'

                print(f"    Mesh has {len(mesh_obj.vertex_groups)} vertex groups")
            else:
                print(f"    Warning: Mesh has no vertex groups, skipping armature binding")

        # Delete redundant armatures
        for arm in new_armatures:
            print(f"  Removing redundant armature: {arm.name}")
            bpy.data.objects.remove(arm, do_unlink=True)

    # Count final meshes
    final_mesh_count = len([obj for obj in bpy.context.scene.objects if obj.type == 'MESH'])
    print(f"\nFinal scene has {final_mesh_count} meshes (base: {base_mesh_count}, added: {final_mesh_count - base_mesh_count})")

    # List all final meshes for debugging
    print("\nFinal mesh list:")
    for obj in bpy.context.scene.objects:
        if obj.type == 'MESH':
            parent_info = f"parent: {obj.parent.name}" if obj.parent else "no parent"
            mod_info = f"mods: {[m.type for m in obj.modifiers]}" if obj.modifiers else "no mods"
            vg_info = f"vgroups: {len(obj.vertex_groups)}"
            print(f"  - {obj.name} ({parent_info}, {mod_info}, {vg_info})")

    # Export merged GLB
    print(f"\nExporting merged GLB to: {output_path}")
    bpy.ops.export_scene.gltf(
        filepath=output_path,
        export_format='GLB',
        use_selection=False
    )

    print("Merge complete!")
    return True

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: blender --background --python merge_glb_files.py -- <base.glb> <output.glb> <additional1.glb> [additional2.glb] ...")
        sys.exit(1)

    # Arguments after -- are passed to the script
    argv = sys.argv
    argv = argv[argv.index("--") + 1:]

    base_path = argv[0]
    output_path = argv[1]
    additional_paths = argv[2:]

    try:
        merge_glb_files(base_path, additional_paths, output_path)
        print("SUCCESS")
        sys.exit(0)
    except Exception as e:
        print(f"ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
