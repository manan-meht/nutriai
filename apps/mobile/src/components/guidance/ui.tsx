import { useState, type ReactNode } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { GM, GM_TAP } from '@/constants/guidance-theme';
import { amount, dayValueText, estimate, isUnknownDay, labelOf, overIsNotable } from '@/lib/guidance-format';
import type { NutrientDay, NutrientKey } from '@/lib/guidance-types';

// Shared pieces of the Guidance screens: text, cards, buttons, the progress
// bar. The phone's counterpart of the web's src/components/guidance/ui.tsx;
// the formatting half of that file is lib/guidance-format.ts. Colours come
// from the GM palette (charcoal and lavender, always dark).

type Variant = 'display' | 'h1' | 'h2' | 'h3' | 'body' | 'small' | 'caption' | 'eyebrow';
type Tone = 'primary' | 'secondary' | 'muted' | 'accent' | 'error' | 'over' | 'onAccent';

const TONES: Record<Tone, string> = {
  primary: GM.text,
  secondary: GM.textSecondary,
  muted: GM.textMuted,
  accent: GM.accentText,
  error: GM.errorText,
  over: GM.overText,
  onAccent: GM.onAccent,
};

export function GText({
  variant = 'body',
  tone = 'primary',
  italic,
  bold,
  style,
  ...rest
}: TextProps & { variant?: Variant; tone?: Tone; italic?: boolean; bold?: boolean }) {
  return (
    <Text
      style={[
        text[variant],
        { color: TONES[tone] },
        italic && { fontStyle: 'italic' },
        bold && { fontWeight: '700' },
        style,
      ]}
      {...rest}
    />
  );
}

const text = StyleSheet.create({
  display: { fontSize: 30, lineHeight: 36, fontWeight: '700', letterSpacing: -0.5 },
  h1: { fontSize: 24, lineHeight: 30, fontWeight: '700', letterSpacing: -0.3 },
  h2: { fontSize: 20, lineHeight: 26, fontWeight: '700', letterSpacing: -0.2 },
  h3: { fontSize: 17, lineHeight: 23, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 23 },
  small: { fontSize: 14, lineHeight: 20 },
  caption: { fontSize: 12, lineHeight: 17 },
  eyebrow: { fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' },
});

/** A section of the screen. `accessibilityLabel` names it for readers of
 * the code (the web's aria-label); it isn't set on the View, which isn't
 * itself focusable, so screen readers move through its contents. */
export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle>; accessibilityLabel?: string }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  accessibilityLabel,
  style,
  hero,
  full,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  /** On the light next-meal card. */
  hero?: boolean;
  full?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primary,
        { backgroundColor: hero ? GM.heroButton : pressed ? GM.accentHover : GM.accent },
        full && styles.full,
        (disabled || pressed) && { opacity: disabled ? 0.6 : 0.9 },
        style,
      ]}
    >
      <Text style={[styles.primaryText, { color: hero ? '#FFFFFF' : GM.onAccent }]}>{label}</Text>
    </Pressable>
  );
}

export function SecondaryButton({
  label,
  onPress,
  disabled,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.secondary, pressed && { backgroundColor: 'rgba(255,255,255,0.05)' }, disabled && { opacity: 0.5 }]}
    >
      <Text style={styles.secondaryText}>{label}</Text>
    </Pressable>
  );
}

/** A text button: lavender words, still a full 44 pt to tap. */
export function QuietButton({
  label,
  onPress,
  disabled,
  arrow,
  accessibilityLabel,
  expanded,
  pressed: isPressed,
  color = GM.accentText,
  style,
  trailing,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  arrow?: boolean;
  accessibilityLabel?: string;
  /** For a disclosure: whether what it opens is open. */
  expanded?: boolean;
  /** For a toggle: whether it's on. */
  pressed?: boolean;
  color?: string;
  style?: StyleProp<ViewStyle>;
  trailing?: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled, expanded, checked: isPressed }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [styles.quiet, (pressed || disabled) && { opacity: disabled ? 0.6 : 0.7 }, style]}
    >
      <Text style={[styles.quietText, { color }]}>
        {label}
        {arrow ? ' →' : ''}
      </Text>
      {trailing}
    </Pressable>
  );
}

export function ErrorLine({ error, color = GM.errorText, style }: { error: string | null; color?: string; style?: StyleProp<TextStyle> }) {
  if (!error) return null;
  return (
    <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.error, { color }, style]}>
      {error}
    </Text>
  );
}

export function Chevron({ direction = 'right', color = GM.textSecondary, size = 20 }: { direction?: 'right' | 'down' | 'up'; color?: string; size?: number }) {
  const rotate = direction === 'down' ? '90deg' : direction === 'up' ? '-90deg' : '0deg';
  return (
    <View style={{ transform: [{ rotate }] }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path d="M9 6l6 6-6 6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

/** Two or three choices in a row, one of them on: the Today/Progress tabs,
 * week or month, protein, energy or fibre. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  role = 'button',
  style,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  label: string;
  role?: 'button' | 'tab';
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.segmented, style]} accessibilityRole={role === 'tab' ? 'tablist' : undefined} accessibilityLabel={label}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole={role}
            accessibilityLabel={o.label}
            accessibilityState={role === 'tab' ? { selected: on } : { checked: on }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, on && { backgroundColor: GM.accent }]}
          >
            <Text style={[styles.segmentText, { color: on ? GM.onAccent : GM.textSecondary }, on && { fontWeight: '700' }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function BetaPill({ dark = true }: { dark?: boolean }) {
  return (
    <View style={[styles.pill, dark ? styles.pillDark : styles.pillLight]}>
      <Text style={[styles.pillText, { color: dark ? GM.accentText : '#6D28D9' }]}>Beta</Text>
    </View>
  );
}

/** The amber note: beta, unreviewed targets, and similar. */
export function Note({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View accessibilityRole="text" style={[styles.note, style]}>
      {children}
    </View>
  );
}

export function Bar({ day, nutrient }: { day: NutrientDay; nutrient: NutrientKey }) {
  const pct = day.target > 0 ? Math.min(100, (day.consumed / day.target) * 100) : 0;
  return (
    <View style={styles.track} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <View
        style={[
          styles.fill,
          { width: `${pct}%`, backgroundColor: day.over > 0 && overIsNotable(nutrient) ? GM.over : GM.accent },
        ]}
      />
    </View>
  );
}

/** One nutrient's day so far against its target. `mealCount` tells a
 * floor ("at least") from an unknown (no meal reported it). */
export function NutrientRow({ day, nutrient, mealCount }: { day: NutrientDay; nutrient: NutrientKey; mealCount: number }) {
  const unknown = isUnknownDay(day, mealCount);
  const value = `${dayValueText(day, nutrient, mealCount)} / ${amount(day.target, nutrient)}`;
  return (
    <View accessible accessibilityLabel={`${labelOf(nutrient)}: ${unknown ? 'Unknown' : value}`}>
      <View style={styles.rowBetween}>
        <GText variant="body" style={{ fontWeight: '600' }}>
          {labelOf(nutrient)}
        </GText>
        <GText variant="body" style={styles.tabular}>
          {unknown ? (
            <GText tone="secondary">Unknown / {amount(day.target, nutrient)}</GText>
          ) : (
            <>
              {day.isIncomplete ? <GText tone="secondary">at least </GText> : null}
              {estimate(day.consumed, nutrient)} / {amount(day.target, nutrient)}
            </>
          )}
        </GText>
      </View>
      <View style={{ marginTop: 8 }}>
        <Bar day={day} nutrient={nutrient} />
      </View>
    </View>
  );
}

/** A labelled text input on the dark palette. */
export function TextField({
  label,
  hint,
  hideLabel,
  style,
  ...input
}: TextInputProps & { label: string; hint?: string; hideLabel?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={style}>
      {!hideLabel && (
        <GText variant="small" style={styles.fieldLabel}>
          {label}
        </GText>
      )}
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={hint}
        placeholderTextColor={GM.textMuted}
        selectionColor={GM.accent}
        keyboardAppearance="dark"
        style={[styles.input, input.multiline && { minHeight: 72, textAlignVertical: 'top' }]}
        {...input}
      />
      {hint ? (
        <GText variant="caption" tone="muted" style={{ marginTop: 4 }}>
          {hint}
        </GText>
      ) : null}
    </View>
  );
}

/** Choices as a row of tappable chips: one of a few (radio). */
export function ChoiceChips<T extends string>({
  label,
  options,
  value,
  onChange,
  hideLabel,
}: {
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T | '';
  onChange: (value: T) => void;
  hideLabel?: boolean;
}) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label}>
      {!hideLabel && (
        <GText variant="small" style={styles.fieldLabel}>
          {label}
        </GText>
      )}
      <View style={styles.chips}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={o.label}
              onPress={() => onChange(o.value)}
              style={[styles.chip, on && styles.chipOn]}
            >
              <Text style={[styles.chipText, { color: on ? GM.text : GM.textSecondary }]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** One of many, chosen from a sheet: a phone's <select>. */
export function SelectField<T extends string>({
  label,
  options,
  value,
  onChange,
  placeholder = 'Choose one',
  hideLabel,
  style,
}: {
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T | '';
  onChange: (value: T) => void;
  placeholder?: string;
  hideLabel?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <View style={style}>
      {!hideLabel && (
        <GText variant="small" style={styles.fieldLabel}>
          {label}
        </GText>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current?.label ?? placeholder}`}
        accessibilityHint="Opens the list of choices"
        onPress={() => setOpen(true)}
        style={[styles.input, styles.select]}
      >
        <Text style={{ color: current ? GM.text : GM.textMuted, fontSize: 15, flexShrink: 1 }} numberOfLines={1}>
          {current?.label ?? placeholder}
        </Text>
        <Chevron direction="down" size={18} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.sheetBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Close" onPress={() => setOpen(false)} />
          <View style={styles.sheet} accessibilityViewIsModal>
            <GText variant="h3" style={{ marginBottom: 8 }}>
              {label}
            </GText>
            <ScrollView style={{ maxHeight: 420 }}>
              {options.map((o) => {
                const on = o.value === value;
                return (
                  <Pressable
                    key={o.value}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={o.label}
                    onPress={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                    style={[styles.sheetOption, on && { backgroundColor: GM.accentSoft }]}
                  >
                    <Text style={{ color: on ? GM.text : GM.textSecondary, fontSize: 16, fontWeight: on ? '700' : '500' }}>{o.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <QuietButton label="Cancel" onPress={() => setOpen(false)} style={{ alignSelf: 'center' }} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

export const styles = StyleSheet.create({
  fieldLabel: { fontWeight: '600', marginBottom: 6 },
  input: {
    minHeight: GM_TAP + 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GM.borderStrong,
    backgroundColor: GM.raised,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: GM.text,
  },
  select: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: GM_TAP,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GM.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipOn: { borderColor: GM.accent, backgroundColor: GM.accentSoft },
  chipText: { fontSize: 15, fontWeight: '600' },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: GM.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: GM.borderStrong,
    padding: 20,
    paddingBottom: 32,
  },
  sheetOption: { minHeight: GM_TAP + 4, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 10 },
  card: { backgroundColor: GM.card, borderColor: GM.border, borderWidth: 1, borderRadius: 18, padding: 20 },
  primary: {
    minHeight: GM_TAP,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  full: { alignSelf: 'stretch' },
  primaryText: { fontSize: 15, fontWeight: '700' },
  secondary: {
    minHeight: GM_TAP + 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GM.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  secondaryText: { fontSize: 15, fontWeight: '600', color: GM.textSecondary },
  quiet: { minHeight: GM_TAP, justifyContent: 'center', alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6 },
  quietText: { fontSize: 15, fontWeight: '600' },
  error: { fontSize: 14, lineHeight: 20, marginTop: 8 },
  segmented: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: GM.borderStrong,
    borderRadius: 12,
    padding: 3,
  },
  segment: { flex: 1, minHeight: GM_TAP - 4, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  segmentText: { fontSize: 15, fontWeight: '500' },
  pill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  pillDark: { backgroundColor: GM.accentSoft, borderWidth: 1, borderColor: GM.accentBorder },
  pillLight: { backgroundColor: 'rgba(124, 58, 237, 0.1)' },
  pillText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  note: { borderWidth: 1, borderColor: GM.overBorder, backgroundColor: GM.overSoft, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12 },
  track: { height: 10, borderRadius: 999, backgroundColor: GM.track, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 999 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
  tabular: { fontVariant: ['tabular-nums'] },
  divider: { borderTopWidth: 1, borderTopColor: GM.border, marginTop: 16, paddingTop: 16 },
});
