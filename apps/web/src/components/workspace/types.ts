export type WorkspaceView =
  | "chat"
  | "notifications"
  | "onboarding"
  | "profile"
  | "requests"
  | "scout"

export type Role = {
  groupName: string
  groupSlug: string
  name: string
  slug: string
}
