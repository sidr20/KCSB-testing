// apps/web/src/components/LiveGameStats.jsx
import React, { useState, useEffect } from 'react';

const LiveGameStats = ({ gameId = "401826049" }) => {
  const [plays, setPlays] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLiveStats = async () => {
      try {
        // Calls the Python API we just created
        const response = await fetch(`/api/live-game/${gameId}`);
        const data = await response.json();
        
        // Reverse the plays so the most recent is at the top
        setPlays(data.plays?.reverse() || []);
        setLoading(false);
      } catch (error) {
        console.error("Error fetching live game data:", error);
        setLoading(false);
      }
    };

    // Initial fetch
    fetchLiveStats();

    // Poll for new plays every 15 seconds
    const interval = setInterval(fetchLiveStats, 15000);
    return () => clearInterval(interval);
  }, [gameId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-xl text-blue-800 font-semibold animate-pulse">
          Connecting to live feed...
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-md p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Live Play-by-Play</h2>
        <span className="flex items-center text-sm font-medium text-red-600 bg-red-50 px-3 py-1 rounded-full">
          <span className="w-2 h-2 bg-red-600 rounded-full animate-ping mr-2"></span>
          LIVE
        </span>
      </div>

      <div className="overflow-y-auto max-h-[600px] border border-gray-100 rounded-lg">
        <table className="w-full text-left border-collapse text-sm">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <th className="p-4 border-b text-gray-500 font-semibold w-24">Time</th>
              <th className="p-4 border-b text-gray-500 font-semibold">Play Description</th>
              <th className="p-4 border-b text-gray-500 font-semibold w-24 text-center">Score</th>
            </tr>
          </thead>
          <tbody>
            {plays.map((play) => (
              <tr key={play.id} className="border-b hover:bg-gray-50 transition-colors">
                <td className="p-4 font-medium text-gray-600">
                  {play.period?.number}Q | {play.clock?.displayValue}
                </td>
                <td className="p-4 text-gray-800">
                  {/* Highlight scoring plays */}
                  <span className={play.scoringPlay ? "font-bold text-green-700" : ""}>
                    {play.text}
                  </span>
                </td>
                <td className="p-4 text-center font-bold text-gray-900 bg-gray-50">
                  {play.homeScore} - {play.awayScore}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default LiveGameStats;
