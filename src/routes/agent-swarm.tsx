import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { AgentsScreen } from '@/screens/gateway/agents-screen'

export const Route = createFileRoute('/agent-swarm')({
  component: AgentSwarmRoute,
})

function AgentSwarmRoute() {
  usePageTitle('Agent Hub')
  return <AgentsScreen variant="mission-control" />
}
