"use client";

import {
  memo,
  useEffect,
  useRef,
  useState,
  forwardRef,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  motion,
  useAnimation,
  useInView,
  useMotionTemplate,
  useMotionValue,
} from "motion/react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

// ==================== Input ====================
// Text field with a cursor-tracking glow ring. The ring colour comes from
// `--auth-input-glow`, so the same component works on both skies.

const Input = memo(
  forwardRef(function Input(
    { className, type, ...props }: React.InputHTMLAttributes<HTMLInputElement>,
    ref: React.ForwardedRef<HTMLInputElement>,
  ) {
    const radius = 100;
    const [visible, setVisible] = useState(false);

    const mouseX = useMotionValue(0);
    const mouseY = useMotionValue(0);

    function handleMouseMove({
      currentTarget,
      clientX,
      clientY,
    }: React.MouseEvent<HTMLDivElement>) {
      const { left, top } = currentTarget.getBoundingClientRect();
      mouseX.set(clientX - left);
      mouseY.set(clientY - top);
    }

    return (
      <motion.div
        style={{
          background: useMotionTemplate`
        radial-gradient(
          ${visible ? radius + "px" : "0px"} circle at ${mouseX}px ${mouseY}px,
          var(--auth-input-glow),
          transparent 80%
        )
      `,
        }}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        className="auth-input-shell"
      >
        <input
          type={type}
          className={cn("auth-input", className)}
          ref={ref}
          {...props}
        />
      </motion.div>
    );
  }),
);

Input.displayName = "Input";

// ==================== BoxReveal ====================

type BoxRevealProps = {
  children: ReactNode;
  width?: string;
  boxColor?: string;
  duration?: number;
  overflow?: string;
  position?: string;
  className?: string;
};

const BoxReveal = memo(function BoxReveal({
  children,
  width = "fit-content",
  boxColor,
  duration,
  overflow = "hidden",
  position = "relative",
  className,
}: BoxRevealProps) {
  const mainControls = useAnimation();
  const slideControls = useAnimation();
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });

  useEffect(() => {
    if (isInView) {
      slideControls.start("visible");
      mainControls.start("visible");
    } else {
      slideControls.start("hidden");
      mainControls.start("hidden");
    }
  }, [isInView, mainControls, slideControls]);

  return (
    <section
      ref={ref}
      style={{
        position: position as
          | "relative"
          | "absolute"
          | "fixed"
          | "sticky"
          | "static",
        width,
        overflow,
      }}
      className={className}
    >
      <motion.div
        variants={{
          hidden: { opacity: 0, y: 75 },
          visible: { opacity: 1, y: 0 },
        }}
        initial="hidden"
        animate={mainControls}
        transition={{ duration: duration ?? 0.5, delay: 0.25 }}
      >
        {children}
      </motion.div>
      <motion.div
        variants={{ hidden: { left: 0 }, visible: { left: "100%" } }}
        initial="hidden"
        animate={slideControls}
        transition={{ duration: duration ?? 0.5, ease: "easeIn" }}
        style={{
          position: "absolute",
          top: 4,
          bottom: 4,
          left: 0,
          right: 0,
          zIndex: 20,
          background: boxColor ?? "#E8F0FE",
          borderRadius: 4,
        }}
      />
    </section>
  );
});

// ==================== Ripple ====================

type RippleProps = {
  mainCircleSize?: number;
  mainCircleOpacity?: number;
  numCircles?: number;
  className?: string;
};

const Ripple = memo(function Ripple({
  mainCircleSize = 210,
  mainCircleOpacity = 0.24,
  numCircles = 11,
  className = "",
}: RippleProps) {
  return (
    <section
      aria-hidden="true"
      className={`absolute inset-0 flex max-w-[50%] items-center justify-center [mask-image:linear-gradient(to_bottom,black,transparent)] ${className}`}
    >
      {Array.from({ length: numCircles }, (_, i) => {
        const size = mainCircleSize + i * 70;
        const opacity = mainCircleOpacity - i * 0.03;
        const animationDelay = `${i * 0.12}s`;
        const borderStyle = i === numCircles - 1 ? "dashed" : "solid";

        return (
          <span
            key={i}
            className="absolute animate-ripple rounded-full border border-brand/25"
            style={{
              width: `${size}px`,
              height: `${size}px`,
              opacity,
              animationDelay,
              borderStyle,
              borderWidth: "1px",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
            }}
          />
        );
      })}
    </section>
  );
});

// ==================== OrbitingCircles ====================

type OrbitingCirclesProps = {
  className?: string;
  children: ReactNode;
  reverse?: boolean;
  duration?: number;
  delay?: number;
  radius?: number;
  path?: boolean;
};

const OrbitingCircles = memo(function OrbitingCircles({
  className,
  children,
  reverse = false,
  duration = 20,
  delay = 10,
  radius = 50,
  path = true,
}: OrbitingCirclesProps) {
  return (
    <>
      {path && (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          version="1.1"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 size-full"
        >
          <circle
            className="stroke-ink/10 stroke-1"
            cx="50%"
            cy="50%"
            r={radius}
            fill="none"
          />
        </svg>
      )}
      <section
        style={
          {
            "--duration": duration,
            "--radius": radius,
            "--delay": -delay,
          } as React.CSSProperties
        }
        className={cn(
          "absolute flex size-full transform-gpu animate-orbit items-center justify-center rounded-full border border-border-hairline bg-surface shadow-card [animation-delay:calc(var(--delay)*1000ms)]",
          { "[animation-direction:reverse]": reverse },
          className,
        )}
      >
        {children}
      </section>
    </>
  );
});

// ==================== TechOrbitDisplay ====================

type IconConfig = {
  className?: string;
  duration?: number;
  delay?: number;
  radius?: number;
  path?: boolean;
  reverse?: boolean;
  component: () => React.ReactNode;
};

type TechnologyOrbitDisplayProps = {
  iconsArray: IconConfig[];
  text?: string;
};

const TechOrbitDisplay = memo(function TechOrbitDisplay({
  iconsArray,
  text = "Safeguard.",
}: TechnologyOrbitDisplayProps) {
  return (
    <section className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-lg">
      <span className="pointer-events-none whitespace-pre-wrap bg-gradient-to-b from-ink to-ink-muted bg-clip-text text-center text-7xl font-semibold leading-none text-transparent">
        {text}
      </span>

      {iconsArray.map((icon, index) => (
        <OrbitingCircles
          key={index}
          className={icon.className}
          duration={icon.duration}
          delay={icon.delay}
          radius={icon.radius}
          path={icon.path}
          reverse={icon.reverse}
        >
          {icon.component()}
        </OrbitingCircles>
      ))}
    </section>
  );
});

// ==================== AnimatedForm ====================

type FieldType = "text" | "email" | "password";

type Field = {
  label: string;
  required?: boolean;
  type: FieldType;
  placeholder?: string;
  /** Optional leading glyph inside the field (decorative, hidden from AT). */
  icon?: ReactNode;
  /**
   * Overrides the autocomplete token. Password fields default to
   * "current-password" (sign-in); a registration form must pass
   * "new-password" so the browser offers a generated password and never
   * autofills the existing one.
   */
  autoComplete?: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
};

/**
 * HTML `id`/`for` must not contain whitespace, so a human label like
 * "Confirm password" can't be used verbatim. Derive a stable slug instead
 * (the `name` attribute keeps the original label — form lookups rely on it).
 */
const toFieldId = (label: string): string =>
  label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

type AnimatedFormProps = {
  header: string;
  subHeader?: string;
  /** Icon shown in the rounded tile above the heading. */
  icon?: ReactNode;
  fields: Field[];
  submitButton: string;
  textVariantButton?: string;
  errorField?: string;
  notice?: string;
  /** Disables actions while an async request (e.g. sending OTP) is pending. */
  isSubmitting?: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  providerLabel?: string;
  /** Label between the submit button and the provider button. */
  providerSeparator?: string;
  onProviderClick?: () => void;
  providerIcon?: ReactNode;
  goTo?: (event: React.MouseEvent<HTMLButtonElement>) => void;
};

type Errors = {
  [key: string]: string;
};

const AnimatedForm = memo(function AnimatedForm({
  header,
  subHeader,
  icon,
  fields,
  submitButton,
  textVariantButton,
  errorField,
  notice,
  isSubmitting = false,
  onSubmit,
  providerLabel,
  providerSeparator = "Or sign in with",
  onProviderClick,
  providerIcon,
  goTo,
}: AnimatedFormProps) {
  const [visibleFields, setVisibleFields] = useState<Record<string, boolean>>(
    {},
  );
  const [errors, setErrors] = useState<Errors>({});

  const toggleVisibility = (label: string) =>
    setVisibleFields((current) => ({ ...current, [label]: !current[label] }));

  const validateForm = (event: FormEvent<HTMLFormElement>) => {
    const currentErrors: Errors = {};
    fields.forEach((field) => {
      const value = (event.target as HTMLFormElement)[field.label]?.value;

      if (field.required && !value) {
        currentErrors[field.label] = `${field.label} is required`;
      }

      if (field.type === "email" && value && !/\S+@\S+\.\S+/.test(value)) {
        currentErrors[field.label] = "Invalid email address";
      }

      if (field.type === "password" && value && value.length < 6) {
        currentErrors[field.label] =
          "Password must be at least 6 characters long";
      }
    });
    return currentErrors;
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formErrors = validateForm(event);

    if (Object.keys(formErrors).length === 0) {
      onSubmit(event);
    } else {
      setErrors(formErrors);
    }
  };

  return (
    <section className="auth-form">
      {icon && (
        <div className="auth-icon-tile" aria-hidden="true">
          {icon}
        </div>
      )}

      <BoxReveal boxColor="var(--auth-reveal)" duration={0.3}>
        <h2 className="auth-heading">{header}</h2>
      </BoxReveal>

      {subHeader && (
        <BoxReveal boxColor="var(--auth-reveal)" duration={0.3}>
          <p className="auth-sub">{subHeader}</p>
        </BoxReveal>
      )}

      {notice && (
        <p role="status" className="auth-notice">
          {notice}
        </p>
      )}

      <form onSubmit={handleSubmit} noValidate={false}>
        <div className="auth-fields">
          {fields.map((field) => {
            const fieldId = toFieldId(field.label);
            const fieldError = errors[field.label];
            const isPassword = field.type === "password";
            const isVisible = Boolean(visibleFields[field.label]);

            return (
              <div key={field.label} className="auth-field">
                <Label htmlFor={fieldId} className="auth-label">
                  {field.label}
                  {field.required && (
                    <span className="auth-required" aria-hidden="true">
                      {" *"}
                    </span>
                  )}
                </Label>

                <div className="auth-field__control">
                  {field.icon && (
                    <span className="auth-field__icon" aria-hidden="true">
                      {field.icon}
                    </span>
                  )}
                  <Input
                    type={
                      isPassword ? (isVisible ? "text" : "password") : field.type
                    }
                    id={fieldId}
                    name={field.label}
                    placeholder={field.placeholder}
                    onChange={field.onChange}
                    autoComplete={
                      field.autoComplete ??
                      (isPassword ? "current-password" : field.type)
                    }
                    aria-invalid={fieldError ? true : undefined}
                    aria-describedby={
                      fieldError ? `${fieldId}-error` : undefined
                    }
                    className={cn(
                      field.icon && "auth-input--icon",
                      isPassword && "auth-input--password",
                    )}
                  />

                  {isPassword && (
                    <button
                      type="button"
                      onClick={() => toggleVisibility(field.label)}
                      aria-label={isVisible ? "Hide password" : "Show password"}
                      className="auth-field__toggle"
                    >
                      {isVisible ? (
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  )}
                </div>

                <div className="auth-field__error">
                  {fieldError && (
                    <p id={`${fieldId}-error`} role="alert">
                      {fieldError}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {errorField && (
          <p className="auth-error" role="alert">
            {errorField}
          </p>
        )}

        <button
          className="auth-submit"
          type="submit"
          disabled={isSubmitting}
          aria-busy={isSubmitting}
        >
          {submitButton}
        </button>
      </form>

      {providerLabel && (
        <>
          <div className="auth-divider">
            <span className="auth-divider__rule" />
            <span className="auth-divider__text">{providerSeparator}</span>
            <span className="auth-divider__rule" />
          </div>
          <button
            className="auth-provider"
            type="button"
            onClick={onProviderClick}
            disabled={isSubmitting}
          >
            {providerIcon}
            <span>{providerLabel}</span>
          </button>
        </>
      )}

      {textVariantButton && goTo && (
        <div className="auth-switch">
          <button
            type="button"
            className="auth-switch__btn"
            onClick={goTo}
          >
            {textVariantButton}
          </button>
        </div>
      )}
    </section>
  );
});

// ==================== Label ====================

type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement> & {
  htmlFor?: string;
};

const Label = memo(function Label({ className, ...props }: LabelProps) {
  return (
    <label
      className={cn(
        "text-sm font-medium leading-none text-ink peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
        className,
      )}
      {...props}
    />
  );
});

export {
  Input,
  BoxReveal,
  Ripple,
  OrbitingCircles,
  TechOrbitDisplay,
  AnimatedForm,
  Label,
};
