export const MAX_ANALYSIS_FILES = 20;
export const MAX_ANALYSIS_MATERIALS = 8;
export function materialFiles(material) {
  if (Array.isArray(material.attachments) && material.attachments.length) return material.attachments.slice(0,20).map(file => ({ ...file, id:file.id || "__link__" }));
  return [{ id:material.file_id || "__instructions__", name:material.file_name || "선생님 안내", url:material.file_url || "" }];
}
export function materialOptions(materials) {
  return materials.flatMap(material => materialFiles(material).map(file => ({ ...file, materialId:material.id,
    key:`${material.id}:${file.id}`, title:material.file_name, description:material.description || "" })));
}
export function selectTeacherMaterials(materials, selected) {
  const selectedKeys=new Set(selected.map(item=>`${item.materialId}:${item.attachmentId}`));
  const options=materialOptions(materials);
  if (selected.some(item=>!options.some(option=>option.key===`${item.materialId}:${item.attachmentId}`))) throw new Error("선택한 선생님 자료를 확인할 수 없습니다. 자료를 새로 불러온 뒤 다시 선택해 주세요.");
  return materials.map(material=>({...material, attachments:materialFiles(material).filter(file=>selectedKeys.has(`${material.id}:${file.id}`))})).filter(material=>material.attachments.length);
}
