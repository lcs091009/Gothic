import test from "node:test";
import assert from "node:assert/strict";
import { applyStudentFilters, fetchStudents, STUDENT_PAGE_SIZE } from "./studentDirectory.js";
test("student directory applies every partial combination without requiring other fields", () => {
  for (const [filters, expected] of [
    [{}, []], [{grade:"2"}, [["directory_grade",2]]], [{classNumber:"3"}, [["directory_class",3]]],
    [{number:"15"}, [["directory_number",15]]], [{grade:"2",classNumber:"3"},[["directory_grade",2],["directory_class",3]]],
    [{grade:"2",classNumber:"3",number:"15"},[["directory_grade",2],["directory_class",3],["directory_number",15]]],
  ]) {
    const calls=[]; const query={eq(...args){calls.push(args);return this;}};
    applyStudentFilters(query,filters);assert.deepEqual(calls,expected);
  }
  for (const filters of [{grade:4},{classNumber:0},{number:-1},{number:"1.5"},{grade:"hello"}]) {
    assert.throws(()=>applyStudentFilters({eq(){return this;}},filters),/범위/);
  }
});
test("directory queries only student summaries and bounds each server page", async () => {
  const calls=[];
  const query={select(...args){calls.push(["select",...args]);return this;},eq(...args){calls.push(["eq",...args]);return this;},order(){return this;},range(...args){calls.push(["range",...args]);return Promise.resolve({data:[{id:"student"}],count:45});}};
  const client={from(table){assert.equal(table,"profiles");return query;}};
  const result=await fetchStudents({grade:"1"},1,client);
  assert.equal(result.count,45);assert.deepEqual(calls.at(-1),["range",STUDENT_PAGE_SIZE,STUDENT_PAGE_SIZE*2-1]);
  assert.ok(calls.some(c=>c[0]==="eq"&&c[1]==="role"&&c[2]==="student"));
  assert.doesNotMatch(calls[0][1],/created_at|\*/);
});
