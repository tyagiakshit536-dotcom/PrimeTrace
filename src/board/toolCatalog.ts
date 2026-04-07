import {
  ProfessionCardLayout,
  ProfessionTemplateSeed,
} from "./components/ProfessionTemplateNode";
import { DetectiveNodeType } from "./storage/nodeState";

export type BoardToolIconKey =
  | "note"
  | "photo"
  | "document"
  | "map"
  | "poll"
  | "timeline"
  | "thread-hub"
  | "gif"
  | "shape"
  | "audio"
  | "video"
  | "suspect"
  | "interrogation"
  | "checklist"
  | "profession";

export interface BoardToolDefinition {
  id: string;
  label: string;
  quickLabel: string;
  nodeType: DetectiveNodeType;
  iconKey: BoardToolIconKey;
  glyph: string;
  keywords: string[];
  profession?: string;
  template?: ProfessionTemplateSeed;
}

function createProfessionTool(
  id: string,
  label: string,
  quickLabel: string,
  profession: string,
  glyph: string,
  accentColor: string,
  summary: string,
  checklistLines: string[],
  notes: string,
  keywords: string[]
): BoardToolDefinition {
  const layout = resolveProfessionToolLayout(id, profession);

  return {
    id,
    label,
    quickLabel,
    nodeType: "profession-template",
    iconKey: "profession",
    glyph,
    profession,
    keywords,
    template: {
      toolId: id,
      title: label,
      profession,
      status: "Planned",
      summary,
      checklistLines,
      notes,
      accentColor,
      layout,
    },
  };
}

function resolveProfessionToolLayout(
  id: string,
  profession: string
): ProfessionCardLayout {
  const role = profession.toLowerCase();

  if (
    id.includes("timeline") ||
    id.includes("planner") ||
    id.includes("timetable")
  ) {
    return "timeline";
  }

  if (
    id.includes("checklist") ||
    id.includes("tracker") ||
    id.includes("monitor")
  ) {
    return "checklist";
  }

  if (
    id.includes("brief") ||
    id.includes("spec") ||
    id.includes("contract")
  ) {
    return "focus";
  }

  if (
    role.includes("software") ||
    role.includes("architecture") ||
    role.includes("lawyer")
  ) {
    return "split";
  }

  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 33 + id.charCodeAt(index)) >>> 0;
  }

  const cycle: readonly ProfessionCardLayout[] = [
    "stacked",
    "split",
    "timeline",
    "checklist",
    "focus",
  ];

  return cycle[hash % cycle.length];
}

export const CORE_TOOL_DEFINITIONS: readonly BoardToolDefinition[] = [
  {
    id: "sticky-note",
    label: "Add Note",
    quickLabel: "Note",
    nodeType: "sticky-note",
    iconKey: "note",
    glyph: "NT",
    keywords: ["note", "memo", "quick", "idea"],
  },
  {
    id: "photo-drop",
    label: "Add Photo",
    quickLabel: "Photo",
    nodeType: "photo-drop",
    iconKey: "photo",
    glyph: "PH",
    keywords: ["photo", "image", "evidence", "snapshot"],
  },
  {
    id: "evidence-document",
    label: "Add Document",
    quickLabel: "Doc",
    nodeType: "evidence-document",
    iconKey: "document",
    glyph: "DC",
    keywords: ["document", "file", "brief"],
  },
  {
    id: "map-node",
    label: "Add Map",
    quickLabel: "Map",
    nodeType: "map-node",
    iconKey: "map",
    glyph: "MP",
    keywords: ["map", "location", "route"],
  },
  {
    id: "poll-node",
    label: "Add Poll",
    quickLabel: "Poll",
    nodeType: "poll-node",
    iconKey: "poll",
    glyph: "PL",
    keywords: ["poll", "vote", "decision"],
  },
  {
    id: "timeline-event",
    label: "Add Timeline",
    quickLabel: "Timeline",
    nodeType: "timeline-event",
    iconKey: "timeline",
    glyph: "TM",
    keywords: ["timeline", "event", "date"],
  },
  {
    id: "thread-hub",
    label: "Add Thread Hub",
    quickLabel: "Hub",
    nodeType: "thread-hub",
    iconKey: "thread-hub",
    glyph: "HB",
    keywords: ["hub", "thread", "center"],
  },
  {
    id: "gif-node",
    label: "Add GIF",
    quickLabel: "GIF",
    nodeType: "gif-node",
    iconKey: "gif",
    glyph: "GF",
    keywords: ["gif", "media", "animation"],
  },
  {
    id: "shape-node",
    label: "Add Shape",
    quickLabel: "Shape",
    nodeType: "shape-node",
    iconKey: "shape",
    glyph: "SH",
    keywords: ["shape", "diagram", "marker"],
  },
  {
    id: "audio-evidence",
    label: "Add Audio",
    quickLabel: "Audio",
    nodeType: "audio-evidence",
    iconKey: "audio",
    glyph: "AU",
    keywords: ["audio", "voice", "recording"],
  },
  {
    id: "video-evidence",
    label: "Add Video",
    quickLabel: "Video",
    nodeType: "video-evidence",
    iconKey: "video",
    glyph: "VD",
    keywords: ["video", "clip", "media"],
  },
  {
    id: "suspect-profile",
    label: "Add Profile",
    quickLabel: "Profile",
    nodeType: "suspect-profile",
    iconKey: "suspect",
    glyph: "PF",
    keywords: ["profile", "person", "summary"],
  },
  {
    id: "interrogation-log",
    label: "Add Log",
    quickLabel: "Log",
    nodeType: "interrogation-log",
    iconKey: "interrogation",
    glyph: "LG",
    keywords: ["log", "chat", "record"],
  },
  {
    id: "checklist-board",
    label: "Add Checklist",
    quickLabel: "Checklist",
    nodeType: "checklist-board",
    iconKey: "checklist",
    glyph: "CK",
    keywords: ["checklist", "tasks", "tracker"],
  },
];

export const PROFESSION_TOOL_DEFINITIONS: readonly BoardToolDefinition[] = [
  createProfessionTool(
    "project-brief-card",
    "Project Brief Card",
    "Project Brief",
    "Engineering",
    "EN",
    "#2f6f7d",
    "Define scope, constraints, risks, and expected output.",
    ["Clarify requirements", "Confirm resources", "Set milestones", "Review deliverable"],
    "Dependencies and blockers.",
    ["engineering", "project", "brief", "scope"]
  ),
  createProfessionTool(
    "requirement-spec-card",
    "Requirement Spec Card",
    "Spec Card",
    "Software Engineer",
    "SE",
    "#2c4b8a",
    "Capture acceptance criteria and implementation notes.",
    ["List acceptance criteria", "Define edge cases", "Confirm API contracts"],
    "Implementation references.",
    ["spec", "software", "requirements", "acceptance"]
  ),
  createProfessionTool(
    "milestone-tracker",
    "Milestone Tracker",
    "Milestones",
    "Engineering",
    "MS",
    "#3e7f57",
    "Track milestone progress and handoff dates.",
    ["Phase 1", "Phase 2", "QA gate", "Release"],
    "Milestone risks and owner notes.",
    ["milestone", "deadline", "delivery", "progress"]
  ),
  createProfessionTool(
    "bug-tracker-board",
    "Bug Tracker Board",
    "Bug Tracker",
    "Software Engineer",
    "BG",
    "#7d3b42",
    "Track defects by severity, owner, and status.",
    ["Reproduce issue", "Assign owner", "Patch", "Verify fix"],
    "Stack trace, logs, and repro links.",
    ["bug", "defect", "issue", "qa"]
  ),
  createProfessionTool(
    "api-contract-card",
    "API Contract Card",
    "API Card",
    "Software Engineer",
    "AP",
    "#3f5f9b",
    "Define endpoint behavior and contract decisions.",
    ["Method + route", "Schema", "Error map", "Version notes"],
    "Backward compatibility notes.",
    ["api", "contract", "backend", "endpoint"]
  ),
  createProfessionTool(
    "system-design-block",
    "System Design Block",
    "System Design",
    "Architecture",
    "SD",
    "#5d5f7d",
    "Outline components, data flow, and scaling assumptions.",
    ["Define subsystems", "Map integrations", "Capacity estimate", "Trade-offs"],
    "Architecture decisions and alternatives.",
    ["architecture", "design", "system", "infra"]
  ),
  createProfessionTool(
    "architecture-blueprint-card",
    "Architecture Blueprint",
    "Blueprint",
    "Architecture",
    "AR",
    "#536b8a",
    "Capture structural planning and approval checkpoints.",
    ["Site context", "Floor logic", "Materials", "Approval status"],
    "Constraints, codes, and client feedback.",
    ["architecture", "blueprint", "design", "plan"]
  ),
  createProfessionTool(
    "material-estimate-sheet",
    "Material Estimate Sheet",
    "Estimate",
    "Construction",
    "MT",
    "#80653f",
    "Estimate quantities, rates, and procurement schedule.",
    ["List materials", "Rate per unit", "Total estimate", "Purchase priority"],
    "Vendor and lead-time notes.",
    ["material", "estimate", "construction", "budget"]
  ),
  createProfessionTool(
    "labour-shift-roster",
    "Labour Shift Roster",
    "Shift Roster",
    "Labour",
    "LR",
    "#5b6e35",
    "Plan shifts, headcount, and work allocation.",
    ["Morning team", "Afternoon team", "Night support", "Overtime review"],
    "Safety reminders and attendance notes.",
    ["labour", "shift", "roster", "workforce"]
  ),
  createProfessionTool(
    "maintenance-checklist",
    "Maintenance Checklist",
    "Maintenance",
    "Plumber",
    "PM",
    "#2f7a82",
    "Track preventive maintenance and repair progress.",
    ["Inspect fixtures", "Check pressure", "Replace worn parts", "Sign off"],
    "Service history and observations.",
    ["plumber", "maintenance", "repair", "service"]
  ),
  createProfessionTool(
    "lesson-planner",
    "Lesson Planner",
    "Lesson Plan",
    "Teacher",
    "LP",
    "#745fa0",
    "Plan session goals, teaching flow, and evaluation.",
    ["Define objectives", "Class activity", "Assessment", "Homework"],
    "Class reflection and student response.",
    ["teacher", "lesson", "class", "education"]
  ),
  createProfessionTool(
    "attendance-tracker",
    "Attendance Tracker",
    "Attendance",
    "Teacher",
    "AT",
    "#5a7395",
    "Track daily attendance and follow-up actions.",
    ["Mark attendance", "Follow-up absences", "Update guardian", "Submit report"],
    "Attendance patterns and concerns.",
    ["attendance", "teacher", "class", "student"]
  ),
  createProfessionTool(
    "assignment-tracker",
    "Assignment Tracker",
    "Assignments",
    "Student",
    "AS",
    "#5f8a4f",
    "Track assignments by deadline and completion.",
    ["List tasks", "Estimate effort", "Submit draft", "Final submit"],
    "Reference links and rubric notes.",
    ["assignment", "student", "deadline", "study"]
  ),
  createProfessionTool(
    "study-timetable",
    "Study Timetable",
    "Timetable",
    "Student",
    "ST",
    "#377294",
    "Organize study sessions and revision cycles.",
    ["Daily plan", "Topic blocks", "Practice session", "Review"],
    "Energy levels and adjustments.",
    ["study", "timetable", "student", "schedule"]
  ),
  createProfessionTool(
    "exam-revision-board",
    "Exam Revision Board",
    "Revision",
    "Student",
    "EX",
    "#845240",
    "Track exam readiness and weak-topic coverage.",
    ["Topic priority", "Mock test", "Error review", "Final recap"],
    "Difficult areas and confidence status.",
    ["exam", "revision", "student", "practice"]
  ),
  createProfessionTool(
    "case-brief-card",
    "Case Brief Card",
    "Case Brief",
    "Lawyer",
    "LW",
    "#49557a",
    "Summarize legal position, facts, and strategy.",
    ["Case facts", "Applicable law", "Arguments", "Hearing prep"],
    "Client notes and legal references.",
    ["lawyer", "case", "legal", "brief"]
  ),
  createProfessionTool(
    "evidence-chain-log",
    "Evidence Chain Log",
    "Chain Log",
    "Police",
    "EC",
    "#5a6f87",
    "Track evidence movement and custody status.",
    ["Collection", "Tagging", "Storage", "Transfer"],
    "Time stamps and witness confirmation.",
    ["police", "evidence", "custody", "chain"]
  ),
  createProfessionTool(
    "witness-statement-card",
    "Witness Statement",
    "Witness",
    "Police",
    "WS",
    "#4f5f7d",
    "Capture witness details and statement integrity checks.",
    ["Identity verified", "Primary account", "Cross-check", "Follow-up"],
    "Credibility and contradiction notes.",
    ["witness", "statement", "police", "report"]
  ),
  createProfessionTool(
    "incident-report",
    "Incident Report",
    "Incident",
    "Police",
    "IR",
    "#6d4c4c",
    "Record event details, timeline, and responders.",
    ["Incident summary", "Location confirmed", "Responder notes", "Closure"],
    "Attachments and escalation history.",
    ["incident", "report", "law", "record"]
  ),
  createProfessionTool(
    "patrol-route-planner",
    "Patrol Route Planner",
    "Patrol",
    "Police",
    "PR",
    "#3b6a72",
    "Define patrol sectors, timing, and checkpoints.",
    ["Mark sectors", "Assign officers", "Checkpoint order", "Route review"],
    "Area-risk notes and community updates.",
    ["patrol", "route", "police", "security"]
  ),
  createProfessionTool(
    "court-hearing-timeline",
    "Court Hearing Timeline",
    "Court Timeline",
    "Lawyer",
    "CT",
    "#6b5078",
    "Track hearing milestones and filing deadlines.",
    ["File documents", "Prepare evidence", "Witness readiness", "Post-hearing actions"],
    "Courtroom notes and rulings.",
    ["court", "hearing", "timeline", "law"]
  ),
  createProfessionTool(
    "patient-summary",
    "Patient Summary",
    "Patient",
    "Doctor",
    "PS",
    "#3a7280",
    "Capture patient status, diagnosis context, and plan.",
    ["Chief complaint", "Assessment", "Plan", "Follow-up"],
    "Vitals and risk notes.",
    ["doctor", "patient", "medical", "summary"]
  ),
  createProfessionTool(
    "vitals-monitor",
    "Vitals Monitor",
    "Vitals",
    "Hospital",
    "VM",
    "#3c7f66",
    "Track vital trends and alert thresholds.",
    ["Record baseline", "Monitor intervals", "Flag deviations", "Notify team"],
    "Trend notes and intervention history.",
    ["vitals", "hospital", "monitor", "nursing"]
  ),
  createProfessionTool(
    "prescription-plan",
    "Prescription Plan",
    "Prescription",
    "Doctor",
    "RX",
    "#6a6f8c",
    "Define medicine plan, dosage, and contraindications.",
    ["Primary medicine", "Dosage schedule", "Contraindications", "Review date"],
    "Patient response notes.",
    ["medicine", "prescription", "doctor", "treatment"]
  ),
  createProfessionTool(
    "medication-schedule",
    "Medication Schedule",
    "Med Schedule",
    "Nursing",
    "MS",
    "#4f7b9d",
    "Track medication rounds and completion status.",
    ["Morning dose", "Afternoon dose", "Night dose", "Missed dose follow-up"],
    "Observations and side effects.",
    ["medication", "schedule", "nurse", "hospital"]
  ),
  createProfessionTool(
    "nursing-care-plan",
    "Nursing Care Plan",
    "Care Plan",
    "Nursing",
    "NC",
    "#46746d",
    "Plan nursing interventions and care outcomes.",
    ["Identify needs", "Intervention plan", "Patient education", "Outcome review"],
    "Handover notes for next shift.",
    ["nursing", "care", "hospital", "plan"]
  ),
  createProfessionTool(
    "plumbing-job-sheet",
    "Plumbing Job Sheet",
    "Job Sheet",
    "Plumber",
    "PJ",
    "#2f728f",
    "Capture service request, parts, and completion notes.",
    ["Inspect issue", "Estimate parts", "Repair", "Quality check"],
    "Client sign-off and warranty notes.",
    ["plumber", "job", "service", "repair"]
  ),
  createProfessionTool(
    "household-chore-planner",
    "Household Chore Planner",
    "Chore Plan",
    "House Hold",
    "HC",
    "#6f8a4f",
    "Organize home tasks and weekly ownership.",
    ["Kitchen", "Cleaning", "Laundry", "Shopping"],
    "Priority and due-date notes.",
    ["household", "home", "chores", "family"]
  ),
  createProfessionTool(
    "crop-cycle-planner",
    "Crop Cycle Planner",
    "Crop Planner",
    "Farmer",
    "CR",
    "#4e7a35",
    "Plan sowing, irrigation, and harvest windows.",
    ["Soil prep", "Seed selection", "Irrigation cycle", "Harvest plan"],
    "Weather and market notes.",
    ["farmer", "crop", "agriculture", "harvest"]
  ),
  createProfessionTool(
    "field-operations-card",
    "Field Operations Card",
    "Field Ops",
    "Farmer",
    "FO",
    "#5d6e2f",
    "Track daily field operations and equipment use.",
    ["Crew allocation", "Equipment checks", "Fertilizer plan", "End-of-day log"],
    "Fuel use and labor notes.",
    ["field", "operations", "farm", "labor"]
  ),
  createProfessionTool(
    "art-concept-moodboard",
    "Art Concept Moodboard",
    "Moodboard",
    "Artist",
    "AR",
    "#8a4f74",
    "Shape visual direction, references, and palette.",
    ["Theme intent", "Reference list", "Palette choices", "Iteration notes"],
    "Narrative and style reminders.",
    ["artist", "concept", "moodboard", "creative"]
  ),
  createProfessionTool(
    "creative-production-card",
    "Creative Production Card",
    "Creative Card",
    "Artist",
    "CP",
    "#6f4a8c",
    "Track creative production milestones and deliverables.",
    ["Draft", "Peer feedback", "Final pass", "Publish"],
    "Asset links and approval notes.",
    ["creative", "production", "art", "workflow"]
  ),
];

export const ALL_TOOL_DEFINITIONS: readonly BoardToolDefinition[] = [
  ...CORE_TOOL_DEFINITIONS,
  ...PROFESSION_TOOL_DEFINITIONS,
];

export const DEFAULT_PINNED_TOOL_IDS: readonly string[] = [
  "sticky-note",
  "photo-drop",
  "evidence-document",
  "checklist-board",
  "project-brief-card",
  "lesson-planner",
  "assignment-tracker",
  "patient-summary",
  "case-brief-card",
  "crop-cycle-planner",
  "art-concept-moodboard",
];
