import type {
  NodeTypeForFrontend,
  RelationshipTypeForFrontend,
} from "@/app/const/types";

export interface GraphChangeData {
  nodeCreateData: NodeTypeForFrontend[];
  nodeUpdateData: NodeTypeForFrontend[];
  nodeDeleteData: { id: string }[];
  relationshipCreateData: RelationshipTypeForFrontend[];
  relationshipUpdateData: RelationshipTypeForFrontend[];
  relationshipDeleteData: { id: string }[];
}
