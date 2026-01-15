# AniSeekr Expo Migration & Optimization Plan

## Executive Summary

This plan outlines the migration of features from the original AniSeekr (React + Capacitor + Supabase) to aniseekr-expo (React Native + Expo), with emphasis on achieving UI/UX parity including animations, bounce effects, and overall architecture optimization.

**Key Objective:** Make Expo version functionally and visually identical to the reference implementation while leveraging React Native's native performance advantages.

---

## Current State Analysis

### Reference Implementation (AniSeekr - "Swift")

- **Tech Stack:** React 18 + Vite + Capacitor + Supabase
- **Lines of Code:** ~15,000+ across 109 files
- **Backend:** Supabase PostgreSQL + Edge Functions
- **State:** TanStack Query + Context API
- **Animations:** React Spring (physics-based, 60fps)
- **UI Library:** Radix UI (50+ components)
- **Features:** Full auth, achievements, themes, avatar, cloud sync

### Current Implementation (aniseekr-expo)

- **Tech Stack:** React 19 + Expo 54 + SQLite
- **Lines of Code:** ~6,500 across 51 files
- **Backend:** Local SQLite + AsyncStorage
- **State:** useState only (no global state)
- **Animations:** React Native Reanimated (basic)
- **UI Library:** Custom components + Tailwind
- **Features:** Basic functionality, no auth, local only

### Feature Gap: **~65%**

---

## Phase 1: UI/UX Parity (Weeks 1-3)

### 1.1 Animation System Migration

**Objective:** Match Swift's smooth physics-based animations with bounce effects

#### Current State

- Expo: Basic Reanimated with spring config
- Swift: React Spring with complex physics

#### Required Migrations

##### 1.1.1 Swipe Interactions

**File:** `components/rate/PhotoCard.tsx`
**Target:** Tinder-style swiping with bounce on threshold

```typescript
// Current Expo (Basic)
const cardOffset = useSharedValue({ x: 0, y: 0 });

// Target (Swift parity)
const SWIPE_THRESHOLD = 120;
const BOUNCE_CONFIG = {
  damping: 15,
  stiffness: 180,
  mass: 0.8,
  overshootClamping: false,
};

// On swipe end
if (abs(offset.x) > SWIPE_THRESHOLD) {
  // Bounce back animation
  cardOffset.value = withSpring({ x: 0, y: 0 }, BOUNCE_CONFIG);
  HapticsManager.play('impactHeavy');
} else {
  // Snap to nearest edge
  cardOffset.value = withSpring({ x: offset.x > 0 ? 300 : -300, y: 0 }, BOUNCE_CONFIG);
}
```

**Tasks:**

- [ ] Implement physics-based spring system
- [ ] Add swipe threshold detection
- [ ] Add bounce-back animation
- [ ] Integrate haptic feedback at threshold
- [ ] Add rotation based on swipe distance
- [ ] Implement card stack parallax effect

**Effort:** 3 days

##### 1.1.2 Card Reveal Animation

**File:** `components/gacha/CardPackOpening.tsx` (create new)
**Target:** Sequential reveal with delay and spring bounce

```typescript
// Swift parity animation
const revealSequence = async (cards: GachaCard[]) => {
  for (let i = 0; i < cards.length; i++) {
    await animate(cardOpacity[i], { from: 0, to: 1 }, { duration: 400, delay: i * 200 });

    await animate(
      cardScale[i],
      { from: 0.5, to: 1 },
      { duration: 600, type: 'spring', bounce: 0.5 }
    );

    if (cards[i].rarity === 'SSR') {
      HapticsManager.play('cardDraw');
    }
  }
};
```

**Tasks:**

- [ ] Create CardPackOpening component
- [ ] Implement sequential reveal animation
- [ ] Add spring bounce on each reveal
- [ ] Add rarity-specific effects (glow, particles)
- [ ] Sync haptic feedback with animation timing
- [ ] Add confetti for SSR pulls

**Effort:** 4 days

##### 1.1.3 Page Transitions

**Files:** All screen files
**Target:** Smooth slide/fade transitions with bounce

```typescript
// Shared transition config
const PageTransition = {
  gestureDirection: 'horizontal',
  transitionSpec: {
    open: {
      animation: 'spring',
      config: {
        damping: 15,
        stiffness: 150,
        mass: 0.8,
        overshootClamping: false,
      },
    },
    close: {
      animation: 'spring',
      config: {
        damping: 15,
        stiffness: 150,
        mass: 0.8,
        overshootClamping: false,
      },
    },
  },
};
```

**Tasks:**

- [ ] Create shared transition config
- [ ] Apply to all navigation transitions
- [ ] Add spring bounce on page mount
- [ ] Optimize for 60fps
- [ ] Test on both iOS and Android

**Effort:** 2 days

##### 1.1.4 Micro-Interactions

**Target:** All buttons, cards, list items
**Implementation:** Scale-based press feedback

```typescript
// Universal press animation
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const usePressAnimation = () => {
  const scale = useSharedValue(1);

  const pressIn = () => {
    'worklet';
    scale.value = withSpring(0.94, { damping: 15, stiffness: 300 });
  };

  const pressOut = () => {
    'worklet';
    scale.value = withSpring(1, { damping: 10, stiffness: 300 });
  };

  return { scale, pressIn, pressOut };
};
```

**Tasks:**

- [ ] Create animated pressable component
- [ ] Apply to all buttons
- [ ] Apply to all cards
- [ ] Apply to all list items
- [ ] Add haptic feedback on press

**Effort:** 3 days

---

### 1.2 Component System Migration

#### 1.2.1 Profile Enhancement

**File:** `app/profile.tsx`
**Target:** Match Swift's rich profile screen

**Missing Components:**

- AvatarUploader
- Stats grid with animated counters
- Favorite character card
- Achievement preview
- Theme selector
- Edit profile sheet

**Tasks:**

- [ ] Create `components/profile/AvatarUploader.tsx`
- [ ] Create `components/profile/StatsGrid.tsx` with animated counters
- [ ] Create `components/profile/FavoriteCharacterCard.tsx`
- [ ] Create `components/profile/AchievementPreview.tsx`
- [ ] Create `components/profile/ThemeSelector.tsx`
- [ ] Create `components/profile/EditProfileSheet.tsx`
- [ ] Integrate all into profile screen
- [ ] Add pull-to-refresh

**Effort:** 5 days

#### 1.2.2 Achievement System

**Files:** Create new achievement components
**Target:** Complete achievement UI with progress tracking

**Components to Create:**

- `AchievementsGrid.tsx` - Grid view of badges
- `AchievementsList.tsx` - List view with progress
- `AchievementDetailDialog.tsx` - Full detail modal
- `AchievementProgress.tsx` - Progress bar component
- `AchievementBadge.tsx` - Individual badge component

**Animation Requirements:**

- Bounce on unlock
- Progress animation (0% → current%)
- Glow effect for newly unlocked
- Shimmer for locked achievements

**Tasks:**

- [ ] Port achievement data from Swift
- [ ] Create all achievement components
- [ ] Implement progress tracking
- [ ] Add unlock animations
- [ ] Integrate with profile screen
- [ ] Add achievement notification system

**Effort:** 6 days

#### 1.2.3 Enhanced Gacha UI

**Files:** `app/gacha.tsx`, `components/gacha/*.tsx`
**Target:** Match Swift's rich gacha interface

**Missing Features:**

- God pack button (dev mode)
- Shard system for duplicates
- Card detail view
- Pack opening animation (1.1.2)
- Collection sort (6 options)
- Card management interface

**Tasks:**

- [ ] Create `components/gacha/CardDetailView.tsx`
- [ ] Create `components/gacha/ShardCounter.tsx`
- [ ] Create `components/gacha/SortSelector.tsx`
- [ ] Implement 6 sort options (newest, oldest, rarity, popularity, count, id)
- [ ] Add card pack opening animation
- [ ] Add god pack button (dev mode)
- [ ] Implement shard system
- [ ] Create card management screen

**Effort:** 5 days

#### 1.2.4 Collection Enhancement

**File:** `app/collection.tsx`
**Target:** Rich collection with sorting and filtering

**Missing Features:**

- Infinite scroll
- Advanced sorting (6 modes)
- Detail view navigation
- Swipe to dismiss
- Empty states with illustrations
- Folder management

**Tasks:**

- [ ] Implement infinite scroll with FlatList
- [ ] Add 6 sort options
- [ ] Add swipe-to-dismiss actions
- [ ] Create empty state illustrations
- [ ] Add folder management (create, edit, delete)
- [ ] Add detail view navigation

**Effort:** 4 days

---

## Phase 2: Architecture & API Migration (Weeks 4-5)

### 2.1 Authentication System

**Objective:** Migrate to Supabase auth from local-only

#### 2.1.1 Supabase Integration

**File:** `modules/supabase/client.ts` (create new)
**Dependencies:** `@supabase/supabase-js`

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Types
export type Database = {
  public: {
    Tables: {
      user_profiles: {
        Row: UserProfile;
        Insert: UserProfileInsert;
        Update: UserProfileUpdate;
      };
      user_ratings: {
        Row: UserRating;
        Insert: UserRatingInsert;
        Update: UserRatingUpdate;
      };
      gacha_cards: {
        Row: GachaCard;
        Insert: GachaCardInsert;
        Update: GachaCardUpdate;
      };
      achievements: {
        Row: Achievement;
        Insert: AchievementInsert;
        Update: AchievementUpdate;
      };
      user_achievements: {
        Row: UserAchievement;
        Insert: UserAchievementInsert;
        Update: UserAchievementUpdate;
      };
    };
  };
};
```

**Tasks:**

- [ ] Set up Supabase project
- [ ] Create client module
- [ ] Generate TypeScript types from database
- [ ] Configure environment variables
- [ ] Test connection

**Effort:** 2 days

#### 2.1.2 Authentication Context

**File:** `context/SessionContext.tsx` (create new)

```typescript
interface SessionContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
}

export const SessionProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Initialize auth state
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) throw error;
  };

  const value: SessionContextValue = {
    session,
    user,
    loading,
    signUp,
    signIn,
    signOut,
    resetPassword,
    updatePassword: async (newPassword: string) => {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) throw error;
    },
  };

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
};
```

**Tasks:**

- [ ] Create SessionContext with full auth methods
- [ ] Add auth state persistence
- [ ] Add error handling
- [ ] Add loading states
- [ ] Wrap app in SessionProvider

**Effort:** 2 days

#### 2.1.3 Auth Screens

**Files:** Create new auth screens
**Location:** `app/(auth)/`

```typescript
// app/(auth)/login.tsx
export default function LoginScreen() {
  const { signIn } = useSession();
  const router = useRouter();

  // Form with email/password
  // Loading states
  // Error handling
  // Navigation to signup/forgot-password
}

// app/(auth)/signup.tsx
export default function SignupScreen() {
  const { signUp } = useSession();
  // Registration form
  // Password confirmation
  // Email verification
}

// app/(auth)/reset-password.tsx
export default function ResetPasswordScreen() {
  const { resetPassword } = useSession();
  // Email input
  // Success message
}
```

**Tasks:**

- [ ] Create login screen
- [ ] Create signup screen
- [ ] Create password reset screen
- [ ] Add form validation (Zod)
- [ ] Add loading states
- [ ] Add error handling
- [ ] Add navigation flow
- [ ] Add auth layout

**Effort:** 3 days

---

### 2.2 Data Layer Migration

#### 2.2.1 Supabase Edge Functions

**Objective:** Migrate business logic from client to server

**Functions to Create:**

##### pull-gacha-pack

```typescript
// supabase/functions/pull-gacha-pack/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

serve(async (req) => {
  const { userId, isGodPack } = await req.json();

  // Pull cards with rarity weights
  // SSR: 3%, SR: 12%, R: 35%, N: 50%
  // God pack: SSR: 30%, SR: 40%, R: 30%

  // Check for duplicates, grant shards
  // Update user's gacha_cards table
  // Check achievements

  return new Response(JSON.stringify({ cards: pulledCards, shards: earnedShards }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
```

##### get-anime-deck

```typescript
// supabase/functions/get-anime-deck/index.ts
// Fetch anime by genre/season
// Apply user preferences
// Return formatted deck for rating
```

##### check-achievements

```typescript
// supabase/functions/check-achievements/index.ts
// Check user's progress
// Unlock new achievements
// Send notifications
```

**Tasks:**

- [ ] Set up Deno environment
- [ ] Create pull-gacha-pack function
- [ ] Create get-anime-deck function
- [ ] Create check-achievements function
- [ ] Add error handling
- [ ] Add rate limiting
- [ ] Deploy to Supabase

**Effort:** 4 days

#### 2.2.2 Repository Migration

**Files:** Update existing repositories

**Enhanced UserRepository:**

```typescript
// libs/repositories/user-repository.ts
export class UserRepository {
  async getProfile(userId: string): Promise<UserProfile> {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) throw error;
    return data;
  }

  async updateProfile(userId: string, updates: Partial<UserProfile>): Promise<UserProfile> {
    const { data, error } = await supabase
      .from('user_profiles')
      .update(updates)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async uploadAvatar(userId: string, file: File): Promise<string> {
    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}/${Math.random()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, file);

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from('avatars').getPublicUrl(fileName);

    // Update profile
    await this.updateProfile(userId, { avatar_url: data.publicUrl });

    return data.publicUrl;
  }

  async getAchievements(userId: string): Promise<UserAchievement[]> {
    const { data, error } = await supabase
      .from('user_achievements')
      .select(
        `
        *,
        achievements (*)
      `
      )
      .eq('user_id', userId);

    if (error) throw error;
    return data || [];
  }

  async checkAchievement(userId: string, achievementId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('user_achievements')
      .select('id')
      .eq('user_id', userId)
      .eq('achievement_id', achievementId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    return !!data;
  }

  async unlockAchievement(userId: string, achievementId: string): Promise<void> {
    // Check if already unlocked
    const alreadyUnlocked = await this.checkAchievement(userId, achievementId);
    if (alreadyUnlocked) return;

    // Unlock achievement
    const { error } = await supabase
      .from('user_achievements')
      .insert({ user_id: userId, achievement_id: achievementId });

    if (error) throw error;

    // Trigger notification
    // Check for follow-up achievements
  }
}
```

**Tasks:**

- [ ] Migrate UserRepository to Supabase
- [ ] Add avatar upload
- [ ] Add achievement methods
- [ ] Add theme preference methods
- [ ] Update AnimeRepository for user-specific data
- [ ] Add data sync methods

**Effort:** 3 days

#### 2.2.3 State Management

**Objective:** Add global state for better data flow

**Solution:** Context API + TanStack Query

```typescript
// context/QueryProvider.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
      retry: 3,
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: 1,
    },
  },
});

export const QueryProvider = ({ children }: { children: ReactNode }) => {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};
```

**Tasks:**

- [ ] Install TanStack Query
- [ ] Create QueryProvider
- [ ] Wrap app in providers
- [ ] Migrate data fetching to useQuery
- [ ] Migrate mutations to useMutation
- [ ] Add optimistic updates
- [ ] Add cache invalidation

**Effort:** 3 days

---

## Phase 3: Performance Optimization (Weeks 6-7)

### 3.1 Image Optimization

**Current Issues:**

- No progressive loading
- No blur-up technique
- No memory management

**Optimizations:**

#### 3.1.1 Progressive Image Loading

**File:** `components/common/ProgressiveImage.tsx`

```typescript
import { Image as ExpoImage } from 'expo-image';
import { Blurhash } from 'blurhash';
import { useState } from 'react';

interface ProgressiveImageProps {
  source: string;
  blurhash?: string;
  style?: any;
}

export function ProgressiveImage({ source, blurhash, style }: ProgressiveImageProps) {
  const [loaded, setLoaded] = useState(false);

  return (
    <>
      {!loaded && blurhash && (
        <Image
          source={{ uri: `blurhash://${blurhash}` }}
          style={[style, { position: 'absolute' }]}
          resizeMode="cover"
        />
      )}

      <ExpoImage
        source={{ uri: source }}
        style={style}
        contentFit="cover"
        transition={1000} // Smooth fade in
        onLoad={() => setLoaded(true)}
        placeholder={blurhash ? 'blurhash' : 'fade'}
        placeholderContentFadeDuration={0.5}
      />
    </>
  );
}
```

**Tasks:**

- [ ] Create ProgressiveImage component
- [ ] Add blurhash support
- [ ] Implement fade transition
- [ ] Apply to all images
- [ ] Test with slow networks

**Effort:** 2 days

#### 3.1.2 Image Preloading

**File:** `libs/image-preloader.ts`

```typescript
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import { Asset } from 'expo-asset';

export class ImagePreloader {
  private cache = new Map<string, string>();

  async preload(url: string): Promise<string> {
    // Check cache
    if (this.cache.has(url)) {
      return this.cache.get(url)!;
    }

    try {
      // Download and cache
      const filename = url.split('/').pop()!;
      const localUri = `${FileSystem.cacheDirectory}${filename}`;

      await FileSystem.downloadAsync(url, localUri);

      // Resize for performance
      const resized = await ImageManipulator.manipulateAsync(
        localUri,
        [{ resize: { width: 400 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );

      this.cache.set(url, resized.uri);
      return resized.uri;
    } catch (error) {
      console.error('Preload failed:', error);
      return url;
    }
  }

  async preloadBatch(urls: string[]): Promise<void> {
    await Promise.all(urls.map((url) => this.preload(url)));
  }

  clearCache(): void {
    this.cache.clear();
  }
}
```

**Tasks:**

- [ ] Implement ImagePreloader class
- [ ] Add batch preloading
- [ ] Integrate with gacha pull
- [ ] Integrate with rating carousel
- [ ] Add cache management

**Effort:** 2 days

### 3.2 List Optimization

**Current Issues:**

- FlatList not optimized
- No item layout calculation
- Excessive re-renders

**Optimizations:**

#### 3.2.1 FlatList Enhancements

```typescript
<FlatList
  data={items}
  renderItem={renderItem}
  keyExtractor={(item) => item.id}

  // Performance optimizations
  getItemLayout={(data, index) => ({
    length: ITEM_HEIGHT,
    offset: ITEM_HEIGHT * index,
    index,
  })}
  removeClippedSubviews={Platform.OS === 'android'}
  maxToRenderPerBatch={10}
  windowSize={10}
  initialNumToRender={10}
  updateCellsBatchingPeriod={50}

  // Animation optimization
  scrollEventThrottle={16}

  // Memory optimization
  ListEmptyComponent={EmptyState}
  ListFooterComponent={LoadingFooter}
/>
```

**Tasks:**

- [ ] Add getItemLayout to all FlatLists
- [ ] Add removeClippedSubviews for Android
- [ ] Add maxToRenderPerBatch
- [ ] Add windowSize
- [ ] Add updateCellsBatchingPeriod
- [ ] Test performance

**Effort:** 1 day

#### 3.2.2 Memoization

**File:** Apply to all expensive components

```typescript
// Before
export function AnimeCard({ anime }) {
  return <View>...</View>;
}

// After
export const AnimeCard = React.memo(({ anime }) => {
  return <View>...</View>;
}, (prev, next) => {
  return prev.anime.id === next.anime.id &&
         prev.anime.title === next.anime.title;
});
```

**Tasks:**

- [ ] Add React.memo to all cards
- [ ] Add custom comparison functions
- [ ] Measure render time before/after
- [ ] Profile for optimization opportunities

**Effort:** 2 days

### 3.3 Animation Performance

**Optimization Strategies:**

```typescript
// 1. Use worklets for UI thread
const runOnUI = useAnimatedStyle(() => {
  return {
    transform: [{ scale: scale.value }],
  };
});

// 2. Avoid layout thrashing
const [layout, setLayout] = useState({ width: 0, height: 0 });

// 3. Native driver always
Animated.timing(value, {
  toValue: 1,
  duration: 300,
  useNativeDriver: true,
});

// 4. Debounce gestures
const gestureHandler = useAnimatedGestureHandler({
  onActive: (e) => {
    runOnJS(() => {
      debouncedUpdate(e.translation);
    })();
  },
});
```

**Tasks:**

- [ ] Audit all animations for native driver
- [ ] Convert layout animations to transform
- [ ] Add gesture debouncing
- [ ] Profile animation performance
- [ ] Optimize for 60fps

**Effort:** 2 days

---

## Phase 4: Code Quality & Testing (Week 8)

### 4.1 TypeScript Improvements

**Issues:**

- Some `any` usage
- Incomplete type coverage
- Missing generics

**Improvements:**

```typescript
// Better types
interface Anime {
  id: string;
  title: string;
  images: {
    jpg: {
      image_url: string;
      large_image_url: string;
    };
  };
}

// Generic repository
interface Repository<T, ID = string> {
  findById(id: ID): Promise<T | null>;
  findAll(filter?: Partial<T>): Promise<T[]>;
  create(data: Omit<T, 'id'>): Promise<T>;
  update(id: ID, updates: Partial<T>): Promise<T>;
  delete(id: ID): Promise<void>;
}
```

**Tasks:**

- [ ] Replace all `any` with proper types
- [ ] Add generics to repositories
- [ ] Create shared type definitions
- [ ] Enable strict mode fully
- [ ] Add type guards

**Effort:** 2 days

### 4.2 Error Handling

**Current Issues:**

- Inconsistent error handling
- No error boundaries
- Basic error messages

**Improvements:**

```typescript
// Error boundary component
class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log to error reporting service
    logError(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <ErrorScreen error={this.state.error} />;
    }

    return this.props.children;
  }
}

// Standardized error types
class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string
  ) {
    super(message);
  }
}

class ValidationError extends Error {
  constructor(
    message: string,
    public field: string,
    public value: any
  ) {
    super(message);
  }
}
```

**Tasks:**

- [ ] Create ErrorBoundary component
- [ ] Create error types
- [ ] Wrap all screens in ErrorBoundary
- [ ] Standardize error messages
- [ ] Add error reporting (Sentry)

**Effort:** 2 days

### 4.3 Testing Setup

**Framework:** Jest + React Native Testing Library

```typescript
// __tests__/components/AnimeCard.test.tsx
import { render, fireEvent } from '@testing-library/react-native';
import { AnimeCard } from '../components/AnimeCard';

describe('AnimeCard', () => {
  it('renders anime title', () => {
    const anime = {
      id: '1',
      title: 'Naruto',
      images: { jpg: { image_url: 'http://example.com' } },
    };

    const { getByText } = render(<AnimeCard anime={anime} />);
    expect(getByText('Naruto')).toBeTruthy();
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    const anime = { /* ... */ };

    const { getByText } = render(
      <AnimeCard anime={anime} onPress={onPress} />
    );

    fireEvent.press(getByText('Naruto'));
    expect(onPress).toHaveBeenCalledWith(anime);
  });
});
```

**Tasks:**

- [ ] Set up Jest
- [ ] Set up React Native Testing Library
- [ ] Write tests for critical components
- [ ] Write tests for repositories
- [ ] Set up CI/CD testing
- [ ] Aim for 80% coverage

**Effort:** 3 days

---

## Summary & Timeline

### Total Effort Estimate

| Phase                             | Weeks       | Days        | Priority    |
| --------------------------------- | ----------- | ----------- | ----------- |
| Phase 1: UI/UX Parity             | 3           | 15          | 🔴 Critical |
| Phase 2: Architecture & API       | 2           | 11          | 🔴 Critical |
| Phase 3: Performance Optimization | 2           | 9           | 🟡 High     |
| Phase 4: Code Quality & Testing   | 1           | 7           | 🟢 Medium   |
| **Total**                         | **8 weeks** | **42 days** | -           |

### Critical Path (Must Do First)

1. **Authentication System** (Week 4)
   - Everything depends on user session
   - Enables cloud features

2. **Supabase Integration** (Week 4)
   - Foundation for all cloud features
   - Required for achievements, sync

3. **Animation System** (Week 1)
   - UI/UX parity priority
   - First impression impact

### Parallel Work Opportunities

While doing Phase 1 (UI/UX), start:

- Supabase project setup
- Database schema design
- Edge function development

### Dependencies

- UI enhancements → Animation system
- Cloud features → Authentication
- Performance → Complete feature set
- Testing → All features

---

## Success Criteria

### Functional Requirements

- [ ] All screens from Swift version implemented
- [ ] User authentication working
- [ ] Data syncing between devices
- [ ] Achievement system fully functional
- [ ] Gacha system matches Swift parity
- [ ] Profile customization complete

### UI/UX Requirements

- [ ] All animations match Swift version
- [ ] Bounce effects implemented
- [ ] Smooth transitions (60fps)
- [ ] Consistent styling across all screens
- [ ] Responsive design for all screen sizes

### Performance Requirements

- [ ] App launch time < 3 seconds
- [ ] List scrolling at 60fps
- [ ] Image loading < 2 seconds (cached)
- [ ] Memory usage < 150MB
- [ ] Bundle size < 2MB

### Code Quality Requirements

- [ ] TypeScript strict mode enabled
- [ ] Zero `any` types
- [ ] All errors handled gracefully
- [ ] Error boundaries in place
- [ ] Test coverage > 80%

---

## Risk Mitigation

### High-Risk Items

**1. Animation Performance**

- **Risk:** 60fps target not achievable
- **Mitigation:** Profile early, use native driver, simplify complex animations

**2. Authentication Migration**

- **Risk:** Data loss for existing users
- **Mitigation:** Create migration script, test thoroughly, backup first

**3. Supabase Latency**

- **Risk:** Cloud operations too slow
- **Mitigation:** Implement optimistic updates, local caching, loading states

### Medium-Risk Items

**1. State Management Complexity**

- **Risk:** TanStack Query learning curve
- **Mitigation:** Start simple, use documentation, prototype first

**2. Feature Creep**

- **Risk:** Adding too many features
- **Mitigation:** Stick to Swift parity, defer new features

### Low-Risk Items

**1. UI Component Porting**

- **Risk:** Straightforward, low complexity
- **Mitigation:** Direct port, minimal changes

**2. Testing Setup**

- **Risk:** Learning curve
- **Mitigation:** Use existing Expo templates, start with unit tests

---

## Next Actions (This Week)

### Immediate (Days 1-2)

1. **Set up Supabase project**
   - Create account
   - Set up database schema
   - Configure environment variables

2. **Create animation system foundation**
   - Implement shared spring configs
   - Create animated pressable component
   - Test bounce effects

3. **Start authentication screens**
   - Create auth folder structure
   - Build login/signup forms
   - Implement form validation

### Short-term (Days 3-5)

1. **Complete authentication flow**
   - Integrate with Supabase
   - Test all auth methods
   - Add error handling

2. **Implement SessionContext**
   - Create context provider
   - Wrap application
   - Test auth state

3. **Begin UI component migration**
   - Start with AvatarUploader
   - Implement StatsGrid
   - Add basic achievements

### Medium-term (Next Week)

1. **Supabase edge functions**
   - Set up Deno environment
   - Create pull-gacha-pack
   - Test locally

2. **Complete achievement system**
   - Port achievement data
   - Create all components
   - Implement progress tracking

3. **Performance audit**
   - Profile current app
   - Identify bottlenecks
   - Create optimization plan

---

## Appendix: File Structure

### Proposed New Structure

```
aniseekr-expo/
├── app/
│   ├── (auth)/
│   │   ├── _layout.tsx
│   │   ├── login.tsx
│   │   ├── signup.tsx
│   │   └── reset-password.tsx
│   ├── (rate)/
│   │   ├── _layout.tsx
│   │   ├── index.tsx
│   │   ├── rating.tsx
│   │   └── anime/[id].tsx
│   ├── bangumi.tsx
│   ├── collection.tsx
│   ├── gacha.tsx
│   ├── profile.tsx
│   ├── (setting)/
│   │   └── settings.tsx
│   ├── _layout.tsx
│   └── index.tsx
├── components/
│   ├── auth/
│   │   ├── AuthButton.tsx
│   │   ├── PasswordReset.tsx
│   │   └── SignupForm.tsx
│   ├── profile/
│   │   ├── AvatarUploader.tsx
│   │   ├── StatsGrid.tsx
│   │   ├── FavoriteCharacterCard.tsx
│   │   ├── AchievementPreview.tsx
│   │   ├── ThemeSelector.tsx
│   │   └── EditProfileSheet.tsx
│   ├── achievements/
│   │   ├── AchievementsGrid.tsx
│   │   ├── AchievementsList.tsx
│   │   ├── AchievementDetailDialog.tsx
│   │   ├── AchievementProgress.tsx
│   │   └── AchievementBadge.tsx
│   ├── gacha/
│   │   ├── CardDetailView.tsx
│   │   ├── ShardCounter.tsx
│   │   ├── SortSelector.tsx
│   │   └── CardPackOpening.tsx
│   └── common/
│       ├── AnimatedPressable.tsx
│       ├── ProgressiveImage.tsx
│       └── ErrorBoundary.tsx
├── context/
│   ├── SessionContext.tsx
│   ├── ThemeContext.tsx
│   ├── DevSettingsContext.tsx
│   └── QueryProvider.tsx
├── libs/
│   ├── clients/
│   │   ├── anilist-client.ts
│   │   ├── jikan-client.ts
│   │   └── supabase-client.ts
│   ├── repositories/
│   │   ├── anime-repository.ts
│   │   ├── user-repository.ts
│   │   └── achievement-repository.ts
│   ├── services/
│   │   ├── gacha-service.ts
│   │   ├── cache-service.ts
│   │   ├── image-preloader.ts
│   │   └── haptics-service.ts
│   └── db.ts
├── hooks/
│   ├── useSession.ts
│   ├── useAuth.ts
│   ├── useAchievements.ts
│   ├── useGacha.ts
│   └── useProfile.ts
├── supabase/
│   └── functions/
│       ├── pull-gacha-pack/
│       ├── get-anime-deck/
│       └── check-achievements/
├── data/
│   └── achievements.ts
├── types/
│   ├── anime.ts
│   ├── user.ts
│   ├── gacha.ts
│   └── achievements.ts
└── utils/
    ├── animations.ts
    ├── formatters.ts
    └── validators.ts
```

---

## Conclusion

This plan provides a comprehensive roadmap for achieving feature parity with the Swift version while optimizing the Expo implementation for production. The 8-week timeline is aggressive but achievable with focused effort.

**Key Success Factors:**

1. Start with authentication (critical path)
2. Prioritize UI/UX parity for user engagement
3. Optimize performance early in development
4. Test thoroughly before each release
5. Maintain code quality throughout

**Immediate Next Step:** Set up Supabase project and begin authentication implementation.

---

_Document Version: 1.0_
_Last Updated: 2026-01-16_
_Author: Migration Planning_
