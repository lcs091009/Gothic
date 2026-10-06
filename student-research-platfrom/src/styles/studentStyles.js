import base from "./appStyles";

// Student screens share the quiet surface and charcoal accents of the menu.
const studentStyles = {
  ...base,
  box: { ...base.box, border: "1px solid #e3e5e8", backgroundColor: "#fff", boxShadow: "none", borderRadius: "16px" },
  subTitle: { ...base.subTitle, color: "#303841", fontSize: "22px", fontWeight: 700 },
  text: { ...base.text, color: "#59616b", fontWeight: 400 },
  button: { ...base.button, backgroundColor: "#303841", fontWeight: 700, boxShadow: "none" },
  driveButton: { ...base.driveButton, backgroundColor: "#303841", fontWeight: 700, boxShadow: "none" },
  headerButton: { ...base.headerButton, border: "1px solid #dde1e6", color: "#454d57", backgroundColor: "#fff", borderRadius: "10px", fontWeight: 600, boxShadow: "none" },
  driveUploadBox: { ...base.driveUploadBox, border: "2px dashed #d3d8de", backgroundColor: "#f7f8fa", boxShadow: "none", borderRadius: "16px" },
  driveUploadBoxActive: { ...base.driveUploadBoxActive, border: "2px solid #737d88", backgroundColor: "#eef0f3", boxShadow: "none" },
  selectedFileBox: { ...base.selectedFileBox, border: "1px solid #e3e5e8", boxShadow: "none" },
  recordCard: { ...base.recordCard, border: "1px solid #e3e5e8", backgroundColor: "#fff", boxShadow: "none" },
  recordTitle: { ...base.recordTitle, color: "#303841", fontWeight: 700 },
  badge: { ...base.badge, backgroundColor: "#f0f1f3", color: "#59616b" },
  fileNameText: { ...base.fileNameText, color: "#59616b", fontWeight: 600 },
  link: { ...base.link, color: "#454d57", fontWeight: 600, textDecoration: "underline", textUnderlineOffset: "3px" },
  dateText: { ...base.dateText, color: "#737d88", fontWeight: 400 },
  sharedFileTitleRow: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" },
  emptySharedFileBox: { marginTop: "20px", padding: "20px", backgroundColor: "#f7f8fa", borderRadius: "12px" },
  teacherSharedLoadingBox: { marginTop: "20px" },
};

export default studentStyles;
