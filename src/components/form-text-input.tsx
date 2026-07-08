import type { ComponentProps } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, spacing } from '@/constants/ui';

type FormTextInputProps = ComponentProps<typeof TextInput> & {
  label: string;
};

export function FormTextInput({ editable = true, label, style, ...textInputProps }: FormTextInputProps) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        editable={editable}
        placeholderTextColor={colors.placeholder}
        style={[styles.input, !editable && styles.disabled, style]}
        {...textInputProps}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.sm,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: spacing.md,
  },
  disabled: {
    color: colors.muted,
    opacity: 0.8,
  },
});
