export const useClockSync = () => {
  const [offset, setOffset] = React.useState(0);
  const [isSynced, setIsSynced] = React.useState(false);

  React.useEffect(() => {
    setOffset(0);
    setIsSynced(true);
  }, []);

  return { syncTime: () => Date.now() + offset, offset, isSynced };
};
