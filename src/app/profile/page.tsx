'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { useAuth } from '@/contexts/AuthContext'
import AvatarBuilder from '@/components/Avatar/AvatarBuilder'
import AvatarDisplay from '@/components/Avatar/AvatarDisplay'
import { updateUserAvatar, updateMemberAvatar, updateUserDisplayName, purchaseItem } from '@/lib/firestore'
import { SHOP_ITEMS, SHOP_ITEM_MAP } from '@/lib/shopItems'
import type { AvatarConfig } from '@/lib/types'
import type { ShopCategory } from '@/lib/shopItems'

const CloudScene = dynamic(() => import('@/components/World/CloudScene'), { ssr: false })

export default function ProfilePage() {
  const router = useRouter()
  const { user, userProfile, loading: authLoading, signOut } = useAuth()

  const [displayName, setDisplayName] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [nameSaved, setNameSaved] = useState(false)
  const [nameError, setNameError] = useState('')

  const [avatarSaving, setAvatarSaving] = useState(false)
  const [avatarDraft, setAvatarDraft] = useState<AvatarConfig | null>(null)

  const [coins, setCoins] = useState(0)
  const [unlockedItems, setUnlockedItems] = useState<string[]>([])
  const [shopTab, setShopTab] = useState<ShopCategory>('hair')
  const [buying, setBuying] = useState<string | null>(null)

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/')
    }
  }, [user, authLoading, router])

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- initialize form fields once the async profile arrives */
    if (userProfile) {
      setDisplayName(userProfile.displayName ?? '')
      if (!avatarDraft) setAvatarDraft(userProfile.avatar)
      setCoins(userProfile.coins ?? 0)
      setUnlockedItems(userProfile.unlockedItems ?? [])
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [userProfile]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    const trimmed = displayName.trim()
    if (!trimmed) {
      setNameError('Display name cannot be empty.')
      return
    }
    if (trimmed.length > 30) {
      setNameError('Display name must be 30 characters or less.')
      return
    }
    setNameError('')
    setSavingName(true)
    try {
      await updateUserDisplayName(user.uid, trimmed)
      setNameSaved(true)
      setTimeout(() => setNameSaved(false), 2000)
    } catch (err: unknown) {
      setNameError(err instanceof Error ? err.message : 'Failed to save name.')
    } finally {
      setSavingName(false)
    }
  }

  function handleAvatarChange(newAvatar: AvatarConfig) {
    if (!user || !userProfile) return
    setAvatarDraft(newAvatar)
    setAvatarSaving(true)
    const groupUpdates = (userProfile.groups ?? []).map(gId =>
      updateMemberAvatar(gId, user.uid, newAvatar)
    )
    Promise.all([updateUserAvatar(user.uid, newAvatar), ...groupUpdates])
      .catch((err) => console.error('Error saving avatar:', err))
      .finally(() => setAvatarSaving(false))
  }

  async function handleSignOut() {
    await signOut()
    router.push('/')
  }

  async function handleBuy(itemId: string, cost: number) {
    if (!user) return
    setBuying(itemId)
    try {
      await purchaseItem(user.uid, itemId, cost)
      setCoins((c) => c - cost)
      setUnlockedItems((prev) => [...prev, itemId])
    } catch (err) {
      console.error('Purchase failed:', err)
    } finally {
      setBuying(null)
    }
  }

  function handleEquip(itemId: string) {
    if (!user || !userProfile) return
    const item = SHOP_ITEM_MAP[itemId]
    if (!item) return
    handleAvatarChange(item.apply(avatarDraft ?? userProfile.avatar))
  }

  if (authLoading) {
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#3476c8' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#efefef', animation: 'pulse 1.5s infinite', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#111', fontWeight: 700, fontSize: 12 }}>BB</span>
          </div>
          <p style={{ color: 'white', fontSize: 14 }}>Loading...</p>
        </div>
      </div>
    )
  }

  if (!user || !userProfile) return null

  return (
    <div style={{ position: 'fixed', inset: 0, overflowY: 'auto' }}>
      {/* Background */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0 }}>
        <CloudScene />
      </div>

      {/* Content */}
      <div style={{ position: 'relative', zIndex: 10, minHeight: '100vh', padding: '20px 20px 40px' }}>

        {/* Header */}
        <div style={{ background: 'rgba(239,239,239,0.85)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', borderRadius: 16, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => router.push('/dashboard')}
            aria-label="Back"
            style={{ color: '#111', background: 'none', border: 'none', fontSize: 20, fontWeight: 700, cursor: 'pointer', lineHeight: 1, padding: 0 }}
          >
            ←
          </button>
          <h1 style={{ color: '#111', fontWeight: 800, fontSize: 18, margin: 0, flex: 1 }}>Edit Profile</h1>
          <span style={{ color: '#f59e0b', fontWeight: 800, fontSize: 15 }}>🪙 {coins.toLocaleString()}</span>
          {avatarSaving && <span style={{ color: '#999', fontSize: 12 }}>Saving...</span>}
        </div>

        {/* Display Name Section */}
        <div style={{ background: '#efefef', borderRadius: 20, padding: 20, marginBottom: 16 }}>
          <h2 style={{ color: '#111', fontWeight: 700, fontSize: 14, marginBottom: 12, marginTop: 0 }}>Display Name</h2>
          <form onSubmit={handleSaveName} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              type="text"
              value={displayName}
              onChange={(e) => { setDisplayName(e.target.value); setNameError(''); setNameSaved(false) }}
              placeholder="Your display name"
              maxLength={30}
              style={{ background: '#d4d4d4', borderRadius: 9999, border: 'none', outline: 'none', padding: '14px 24px', fontSize: 16, color: '#111', width: '100%', boxSizing: 'border-box' }}
            />
            {nameError && <p style={{ color: '#e53e3e', fontSize: 13, margin: 0 }}>{nameError}</p>}
            {nameSaved && <p style={{ color: '#42b842', fontSize: 13, margin: 0 }}>Saved!</p>}
            <button
              type="submit"
              disabled={savingName || displayName.trim() === userProfile.displayName}
              style={{ background: '#42b842', color: 'white', borderRadius: 9999, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 2, fontSize: 15, padding: 14, width: '100%', border: 'none', cursor: savingName || displayName.trim() === userProfile.displayName ? 'not-allowed' : 'pointer', opacity: savingName || displayName.trim() === userProfile.displayName ? 0.5 : 1 }}
            >
              {savingName ? 'Saving...' : 'Save Name'}
            </button>
          </form>
        </div>

        {/* Avatar Builder Section */}
        <div style={{ background: '#efefef', borderRadius: 20, padding: 20, marginBottom: 16 }}>
          <h2 style={{ color: '#111', fontWeight: 700, fontSize: 14, marginBottom: 12, marginTop: 0 }}>Customize Avatar</h2>
          <AvatarBuilder
            value={avatarDraft ?? userProfile.avatar}
            onChange={handleAvatarChange}
            unlockedItems={unlockedItems}
          />
        </div>

        {/* Shop Section */}
        <div style={{ background: '#efefef', borderRadius: 20, padding: 20, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h2 style={{ color: '#111', fontWeight: 700, fontSize: 14, margin: 0 }}>🛍️ Shop</h2>
            <span style={{ color: '#f59e0b', fontWeight: 800, fontSize: 15 }}>🪙 {coins.toLocaleString()}</span>
          </div>

          {/* Category tabs */}
          <div style={{ display: 'flex', gap: 4, background: '#d4d4d4', borderRadius: 12, padding: 4, marginBottom: 14 }}>
            {(['hair', 'accessory', 'eyes', 'background'] as ShopCategory[]).map((cat) => (
              <button
                key={cat}
                onClick={() => setShopTab(cat)}
                style={{
                  flex: 1,
                  padding: '7px 0',
                  borderRadius: 9,
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: 11,
                  background: shopTab === cat ? 'white' : 'transparent',
                  color: shopTab === cat ? '#42b842' : '#888',
                  boxShadow: shopTab === cat ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                  transition: 'all 0.1s',
                }}
              >
                {cat === 'hair' ? '💇 Hair' : cat === 'accessory' ? '🎩 Acc.' : cat === 'eyes' ? '👁️ Eyes' : '🎨 BG'}
              </button>
            ))}
          </div>

          {/* Items grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {SHOP_ITEMS.filter((item) => item.category === shopTab).map((item) => {
              const owned = unlockedItems.includes(item.id)
              const canAfford = coins >= item.cost
              const previewAvatar = item.apply(avatarDraft ?? userProfile.avatar)
              const isEquipped = (() => {
                const current = avatarDraft ?? userProfile.avatar
                if (item.category === 'hair')       return current.hairStyle       === previewAvatar.hairStyle
                if (item.category === 'accessory')  return current.accessory       === previewAvatar.accessory
                if (item.category === 'eyes')       return current.eyeStyle        === previewAvatar.eyeStyle
                if (item.category === 'background') return current.backgroundColor === previewAvatar.backgroundColor
                return false
              })()

              return (
                <div key={item.id} style={{ background: 'white', borderRadius: 16, padding: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
                  <div style={{ borderRadius: '50%', overflow: 'hidden', border: '3px solid #e5e5e5' }}>
                    <AvatarDisplay config={previewAvatar} size={64} />
                  </div>
                  <span style={{ color: '#111', fontSize: 13, fontWeight: 700, textAlign: 'center' }}>{item.label}</span>
                  {owned ? (
                    <button
                      onClick={() => handleEquip(item.id)}
                      disabled={isEquipped}
                      style={{
                        width: '100%',
                        padding: '8px 0',
                        borderRadius: 9999,
                        border: 'none',
                        cursor: isEquipped ? 'default' : 'pointer',
                        fontWeight: 800,
                        fontSize: 12,
                        background: isEquipped ? '#d1fae5' : '#42b842',
                        color: isEquipped ? '#16a34a' : 'white',
                      }}
                    >
                      {isEquipped ? '✓ Equipped' : 'Equip'}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleBuy(item.id, item.cost)}
                      disabled={!canAfford || buying === item.id}
                      style={{
                        width: '100%',
                        padding: '8px 0',
                        borderRadius: 9999,
                        border: 'none',
                        cursor: canAfford ? 'pointer' : 'not-allowed',
                        fontWeight: 800,
                        fontSize: 12,
                        background: canAfford ? '#f59e0b' : '#d4d4d4',
                        color: canAfford ? '#111' : '#999',
                      }}
                    >
                      {buying === item.id ? '...' : `🪙 ${item.cost}`}
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          {coins === 0 && unlockedItems.length === 0 && (
            <p style={{ textAlign: 'center', color: '#999', fontSize: 12, marginTop: 12, marginBottom: 0 }}>
              Earn 🪙 coins by unlocking badges in your plazas!
            </p>
          )}
        </div>

        {/* Account info */}
        <div style={{ background: '#efefef', borderRadius: 20, padding: 20, marginBottom: 16 }}>
          <h2 style={{ color: '#111', fontWeight: 700, fontSize: 14, marginBottom: 12, marginTop: 0 }}>Account</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#555', fontSize: 14 }}>Email</span>
              <span style={{ color: '#111', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }}>{userProfile.email}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#555', fontSize: 14 }}>Member since</span>
              <span style={{ color: '#111', fontSize: 14 }}>
                {userProfile.createdAt ? new Date(userProfile.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Sign Out */}
        <div style={{ background: '#efefef', borderRadius: 20, padding: 20, marginBottom: 16 }}>
          <button
            onClick={handleSignOut}
            style={{ background: '#f5a32d', color: 'white', borderRadius: 9999, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 2, fontSize: 15, padding: 14, width: '100%', border: 'none', cursor: 'pointer' }}
          >
            Sign Out
          </button>
        </div>

      </div>

      <style>{`input::placeholder { color: #999; }`}</style>
    </div>
  )
}
