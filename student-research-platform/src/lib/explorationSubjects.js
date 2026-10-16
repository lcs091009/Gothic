import {subjectGroups} from "./studentCurriculum.js";
export function explorationSubjects(profile,records=[]) {
  return subjectGroups(profile,records).flatMap(group=>group.subjects);
}
