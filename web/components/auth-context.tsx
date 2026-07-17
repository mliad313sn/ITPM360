'use client';

import { createContext, useContext } from 'react';
import type { Me } from '@/lib/types';

export const AuthContext = createContext<Me | null>(null);
export const useMe = () => useContext(AuthContext);
