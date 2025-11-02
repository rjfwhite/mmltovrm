# how to set the right VRM version in python
bpy.context.object.data.vrm_addon_extension.spec_version = '0.0'

# example on exporting to VRM
import bpy
from pathlib import Path

output_filepath = str(Path.home() / "path_to_your_new_vrm_model.vrm")
result = bpy.ops.export_scene.vrm(filepath=output_filepath)
if result != {"FINISHED"}:
    raise Exception(f"Failed to export vrm: {result}")

print(f"{output_filepath=}")

# you need to add the VRM import/export addon for the blender you use.. from 4.2 onwards that's fine
