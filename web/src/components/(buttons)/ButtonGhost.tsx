import { twMerge } from "tailwind-merge";
import ButtonBase, { BUTTON_VARIANTS } from "@/components/(buttons)/ButtonBase";

export default function ({ className, children, ...props }: React.JSX.IntrinsicElements["button"]) {
    return (
        <ButtonBase className={twMerge(BUTTON_VARIANTS.ghost, className)} {...props}>
            {children}
        </ButtonBase>
    );
}
