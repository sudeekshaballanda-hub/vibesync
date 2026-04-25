import React from 'react';

export const useAudioSync = () => {
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [duration, setDuration] = React.useState(0);

  const play = (position = 0, timestamp = null) => {
    setIsPlaying(true);
    if (position) setCurrentTime(position);
  };

  const pause = (position = null) => {
    setIsPlaying(false);
    if (position) setCurrentTime(position);
  };

  const seek = (position, timestamp = null) => {
    setCurrentTime(position);
  };

  return { play, pause, seek, isPlaying, currentTime, duration };
};
