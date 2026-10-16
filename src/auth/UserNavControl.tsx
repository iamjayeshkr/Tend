import { UserButton, Show } from '@clerk/react'
import { LogIn } from 'lucide-react'
import { useTendIdentity } from './TendAuthProvider'

export function UserNavControl({
  onOpenAuth,
}: {
  onOpenAuth?: () => void
}) {
  const identity = useTendIdentity()

  if (!identity.cloudAvailable) return null

  return (
    <div className="tend-clerk-user-nav">
      <Show when="signed-in">
        <UserButton
          appearance={{
            elements: {
              userButtonAvatarBox: 'tend-clerk-avatar',
              userButtonPopoverCard: 'tend-clerk-popover',
            },
          }}
        />
      </Show>
      <Show when="signed-out">
        <button
          type="button"
          className="topbar-nav-button signin-pill"
          onClick={onOpenAuth}
          title="Sign in or create account"
        >
          <LogIn size={14} />
          <span>Sign in</span>
        </button>
      </Show>
    </div>
  )
}
