import {waitUntil} from "@vercel/functions";
import {createAnalysisJobsHandler} from "../server/analysisJobs.js";
export default createAnalysisJobsHandler({waitUntil});
