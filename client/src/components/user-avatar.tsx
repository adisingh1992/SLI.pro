import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface UserAvatarProps {
  firstName: string;
  lastName: string;
  size?: "small" | "medium" | "large";
}

export default function UserAvatar({
  firstName,
  lastName,
  size = "medium",
}: UserAvatarProps) {
  const getInitials = () => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`;
  };

  const getSizeClasses = () => {
    switch (size) {
      case "small":
        return "h-8 w-8 text-sm";
      case "medium":
        return "h-12 w-12 text-md";
      case "large":
        return "h-32 w-32 text-4xl";
      default:
        return "h-12 w-12 text-md";
    }
  };

  return (
    <Avatar
      className={`${getSizeClasses()} bg-[#6c8083] text-white font-bold ${size === "large" ? "border-4 border-white" : ""}`}
    >
      <AvatarFallback className="bg-[#6c8083] text-white">
        {getInitials()}
      </AvatarFallback>
    </Avatar>
  );
}
