'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import {
  User as FirebaseUser,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
} from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { createOrUpdateUser, getUser } from '@/lib/firestore'
import { DEFAULT_AVATAR } from '@/lib/avatarDefaults'
import type { User } from '@/lib/types'

type AuthContextValue = {
  user: FirebaseUser | null
  userProfile: User | null
  loading: boolean
  signInWithGoogle: () => Promise<void>
  signInWithEmail: (email: string, password: string) => Promise<void>
  signUpWithEmail: (email: string, password: string, displayName: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null)
  const [userProfile, setUserProfile] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // Fetch or create user profile in Firestore
  async function syncUserProfile(firebaseUser: FirebaseUser): Promise<void> {
    try {
      let profile = await getUser(firebaseUser.uid)

      if (!profile) {
        // Create a new profile for first-time users
        const newUser: User = {
          uid: firebaseUser.uid,
          email: firebaseUser.email ?? '',
          displayName: firebaseUser.displayName ?? firebaseUser.email?.split('@')[0] ?? 'Buddy',
          avatar: DEFAULT_AVATAR,
          createdAt: new Date(),
          groups: [],
        }
        await createOrUpdateUser(firebaseUser.uid, newUser)
        profile = newUser
      }

      setUserProfile(profile)
    } catch (error) {
      console.error('Error syncing user profile:', error)
    }
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser)

      if (firebaseUser) {
        await syncUserProfile(firebaseUser)
      } else {
        setUserProfile(null)
      }

      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  async function signInWithGoogle(): Promise<void> {
    const provider = new GoogleAuthProvider()
    provider.setCustomParameters({ prompt: 'select_account' })
    const result = await signInWithPopup(auth, provider)
    await syncUserProfile(result.user)
  }

  async function signInWithEmail(email: string, password: string): Promise<void> {
    const result = await signInWithEmailAndPassword(auth, email, password)
    await syncUserProfile(result.user)
  }

  async function signUpWithEmail(
    email: string,
    password: string,
    displayName: string
  ): Promise<void> {
    const result = await createUserWithEmailAndPassword(auth, email, password)

    // Set display name on Firebase Auth profile
    await updateProfile(result.user, { displayName })

    // Create Firestore profile
    const newUser: User = {
      uid: result.user.uid,
      email,
      displayName,
      avatar: DEFAULT_AVATAR,
      createdAt: new Date(),
      groups: [],
    }
    await createOrUpdateUser(result.user.uid, newUser)
    setUserProfile(newUser)
  }

  async function signOut(): Promise<void> {
    await firebaseSignOut(auth)
    setUser(null)
    setUserProfile(null)
  }

  const value: AuthContextValue = {
    user,
    userProfile,
    loading,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
