// services/queue.js
const mongoose = require('mongoose');
const config = require('./media/config/mediaConfig');

// Job schema
const jobSchema = new mongoose.Schema({
  jobId: { type: String, required: true, unique: true },
  type: { type: String, default: 'reel' },
  status: { type: String, enum: ['queued','planning','precomputing','rendering','composing','uploading','completed','failed'], default: 'queued' },
  session: { type: Object, required: true }, // full RenderSession
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  error: { type: String, default: null }
});

const Job = mongoose.models.Job || mongoose.model('Job', jobSchema);

// In-memory concurrency control
let activeJobs = 0;

async function enqueueJob(session) {
  const job = new Job({
    jobId: session.jobId,
    type: session.format,
    session: session,
    status: 'queued'
  });
  await job.save();
  processQueue(); // try to start next job
  return job;
}

async function processQueue() {
  if (activeJobs >= config.MAX_CONCURRENT_RENDERS) return;
  const nextJob = await Job.findOne({ status: 'queued' }).sort({ createdAt: 1 });
  if (!nextJob) return;
  activeJobs++;
  nextJob.status = 'planning';
  await nextJob.save();
  // Start processing (this will be handled by your API route)
  // We'll use a callback registered from the main app
  if (global.processJobCallback) {
    global.processJobCallback(nextJob).finally(async () => {
      activeJobs--;
      await processQueue();
    });
  } else {
    console.error('No job processor registered');
    activeJobs--;
  }
}

async function updateJobStatus(jobId, status, sessionUpdate = {}, error = null) {
  const update = { status, updatedAt: new Date() };
  if (Object.keys(sessionUpdate).length) update['session'] = sessionUpdate;
  if (error) update.error = error;
  await Job.findOneAndUpdate({ jobId }, update);
}

async function getJob(jobId) {
  return Job.findOne({ jobId });
}

module.exports = { enqueueJob, updateJobStatus, getJob, processQueue, setJobProcessor: (fn) => { global.processJobCallback = fn; } };
