/**
 * Utility function to parse an interval string and calculate its average.
 * 
 * @param {string} interval - The interval string in the format "min-max" (e.g., "50-100").
 * @returns {number} - The average of the interval, or 0 if the input is invalid.
 */
function parseIntervalToAverage(interval) {
    if (!interval) return 0; // Return 0 if the interval is undefined or null.
    
    const [min, max] = interval.split('-').map(Number);
    
    // Validate parsed numbers and return the average.
    return (min + max) / 2 || 0; // Fallback to 0 for invalid or NaN results.
}

module.exports = { parseIntervalToAverage };
  