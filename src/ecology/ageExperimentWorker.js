import { runPairedAgeExperiment } from './AgeStructuredExperiment.js';

self.onmessage = ({ data }) => {
  try {
    const result = runPairedAgeExperiment(data.options);
    self.postMessage({ requestId: data.requestId, result });
  } catch (error) {
    self.postMessage({ requestId: data.requestId, error: error.message });
  }
};
