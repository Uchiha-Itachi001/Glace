import React from "react";
import { NetworkIcon, NetworkType } from "./NetworkIcon";
import { NetworkState } from "../../hooks/useNetworkStatus";

interface WifiIconProps {
  state: NetworkState;
  netType?: NetworkType;
  size?: number;
  className?: string;
}

export const WifiIcon: React.FC<WifiIconProps> = ({
  state,
  netType = "wifi",
  size = 15,
  className = "",
}) => {
  return <NetworkIcon state={state} netType={netType} size={size} className={className} />;
};
