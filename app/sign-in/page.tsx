import SignInForm from "./SignInForm";

export default async function SignIn({ searchParams }: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return <SignInForm initialError={error === "link" ? "This sign-in link is invalid or has expired. Request a new link." : null} />;
}
