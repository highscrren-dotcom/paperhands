import { IPublicSignalRow, ISignalCloseRow, ISignalDto, StrategyName } from "./Strategy.interface";

export type MCPBase64 = string;

export interface IMCPImageMessage {
    type: "image";
    mimeType: string;
    data: MCPBase64;
}

export interface IMCPTextMessage {
    type: "text";
    text: string;
}

export type IMCPMessage = IMCPTextMessage | IMCPImageMessage;

export interface IMCPContext {
    [symbol: string]: {
        createdSignal: ISignalDto | null;
        pendingSignal: IPublicSignalRow | null;
        closedSignal: ISignalCloseRow | null;
        currentPrice: number;
    }
}

export interface IMCPPositionOpenCommand {
  symbol: string;
  position: "long" | "short";
  mcpName: MCPName;
  note: string;
}

export interface IMCPPositionCloseCommand {
  symbol: string;
  mcpName: MCPName;
  note: string;
}

export interface IMCPCallbacks {

}

export interface IMCPSchema {
    mcpName: MCPName;
    strategyName: StrategyName;
    positionCost?: number;
    getMessages?: (context: IMCPContext, when: Date) => IMCPMessage[] | Promise<IMCPMessage[]>;
    callbacks?: Partial<IMCPCallbacks>;
}

export type MCPName = string;
