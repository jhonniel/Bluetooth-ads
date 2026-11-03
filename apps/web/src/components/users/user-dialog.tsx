"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Pencil, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { USER_ROLES, type UserRole } from "@bpa/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ROLE_DESCRIPTIONS } from "@/lib/permissions";
import { userCreateSchema, userUpdateSchema, type UserCreateInput, type UserUpdateInput } from "@/lib/validation/user";
import { createUserAction, updateUserAction } from "@/app/(dashboard)/users/actions";

function RoleSelect({ value, onChange }: { value: UserRole; onChange: (role: UserRole) => void }) {
  return (
    <Field>
      <FieldLabel>Role</FieldLabel>
      <Select value={value} onValueChange={(v) => onChange(v as UserRole)}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {USER_ROLES.map((role) => (
            <SelectItem key={role} value={role}>
              {role.charAt(0) + role.slice(1).toLowerCase()}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldDescription>{ROLE_DESCRIPTIONS[value]}</FieldDescription>
    </Field>
  );
}

export function CreateUserDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const { register, control, handleSubmit, formState, reset, setError } = useForm<UserCreateInput>({
    resolver: zodResolver(userCreateSchema),
    defaultValues: { name: "", email: "", role: "VIEWER", password: "" },
  });

  const onSubmit = handleSubmit((values) =>
    startTransition(async () => {
      const result = await createUserAction(values);
      if (!result.ok) {
        for (const [key, messages] of Object.entries(result.fieldErrors ?? {})) {
          if (key in values) setError(key as keyof UserCreateInput, { message: messages[0] });
        }
        return void toast.error(result.error);
      }
      toast.success("User created.");
      reset();
      setOpen(false);
      router.refresh();
    }),
  );

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus /> Add user
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} noValidate className="space-y-5">
          <DialogHeader>
            <DialogTitle>Add user</DialogTitle>
            <DialogDescription>Share the initial password securely and ask the user to keep it private.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field data-invalid={Boolean(formState.errors.name)}>
              <FieldLabel htmlFor="u-name">Name</FieldLabel>
              <Input id="u-name" {...register("name")} />
              <FieldError>{formState.errors.name?.message}</FieldError>
            </Field>
            <Field data-invalid={Boolean(formState.errors.email)}>
              <FieldLabel htmlFor="u-email">Email</FieldLabel>
              <Input id="u-email" type="email" autoComplete="off" {...register("email")} />
              <FieldError>{formState.errors.email?.message}</FieldError>
            </Field>
            <Controller control={control} name="role" render={({ field }) => <RoleSelect value={field.value} onChange={field.onChange} />} />
            <Field data-invalid={Boolean(formState.errors.password)}>
              <FieldLabel htmlFor="u-password">Initial password</FieldLabel>
              <Input id="u-password" type="password" autoComplete="new-password" {...register("password")} />
              <FieldDescription>At least 10 characters with letters and numbers.</FieldDescription>
              <FieldError>{formState.errors.password?.message}</FieldError>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null} Create user
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditUserDialog({ user, isSelf }: { user: { uuid: string; name: string; email: string; role: UserRole; isActive: boolean }; isSelf: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const { register, control, handleSubmit, formState, setError } = useForm<UserUpdateInput>({
    resolver: zodResolver(userUpdateSchema),
    defaultValues: { name: user.name, role: user.role, isActive: user.isActive, password: "" },
  });

  const onSubmit = handleSubmit((values) =>
    startTransition(async () => {
      const result = await updateUserAction(user.uuid, values);
      if (!result.ok) {
        for (const [key, messages] of Object.entries(result.fieldErrors ?? {})) {
          if (key in values) setError(key as keyof UserUpdateInput, { message: messages[0] });
        }
        return void toast.error(result.error);
      }
      toast.success("User updated.");
      setOpen(false);
      router.refresh();
    }),
  );

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Pencil /> Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} noValidate className="space-y-5">
          <DialogHeader>
            <DialogTitle>Edit {user.email}</DialogTitle>
            <DialogDescription>Role and status changes take effect on the user&apos;s next request.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field data-invalid={Boolean(formState.errors.name)}>
              <FieldLabel htmlFor={`name-${user.uuid}`}>Name</FieldLabel>
              <Input id={`name-${user.uuid}`} {...register("name")} />
              <FieldError>{formState.errors.name?.message}</FieldError>
            </Field>
            <Controller
              control={control}
              name="role"
              render={({ field }) => (isSelf ? <FieldDescription>You cannot change your own role.</FieldDescription> : <RoleSelect value={field.value} onChange={field.onChange} />)}
            />
            {!isSelf ? (
              <Controller
                control={control}
                name="isActive"
                render={({ field }) => (
                  <Field orientation="horizontal">
                    <Switch id={`active-${user.uuid}`} checked={field.value} onCheckedChange={field.onChange} />
                    <FieldLabel htmlFor={`active-${user.uuid}`} className="font-normal">
                      Account active
                    </FieldLabel>
                  </Field>
                )}
              />
            ) : null}
            <Field data-invalid={Boolean(formState.errors.password)}>
              <FieldLabel htmlFor={`pw-${user.uuid}`}>Reset password</FieldLabel>
              <Input id={`pw-${user.uuid}`} type="password" autoComplete="new-password" placeholder="Leave empty to keep the current password" {...register("password")} />
              <FieldError>{formState.errors.password?.message}</FieldError>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null} Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
