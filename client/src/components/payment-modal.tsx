import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, Check, QrCode } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface PaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentTier: 'free' | 'premium' | 'subscription';
}

export function PaymentModal({ open, onOpenChange, currentTier }: PaymentModalProps) {
  const [selectedTier, setSelectedTier] = useState<'premium' | 'subscription' | null>(null);
  const [qrCode, setQrCode] = useState<string>('');
  const [checkoutUrl, setCheckoutUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const tiers = [
    {
      id: 'free' as const,
      name: 'Free Tier',
      price: '$0',
      description: 'Current Plan',
      features: [
        'Brand assessment survey completion',
        'Document upload capability (resume, LinkedIn PDF, personality assessments)',
        'Session 1 with SLI AI Coach: Functional Identity Mapping',
        'Basic positioning insights and progress tracking'
      ],
      disabled: true,
      isCurrent: currentTier === 'free'
    },
    {
      id: 'premium' as const,
      name: 'Premium Tier',
      price: '$129',
      description: 'One-time payment',
      features: [
        'Complete micro-session trilogy (Sessions 1-3)',
        'Optional enhancement modules (A, B, C)',
        'SLI generation with multiple options',
        'LinkedIn optimization and posting',
        'PDF conversation downloads'
      ],
      disabled: currentTier === 'premium' || currentTier === 'subscription',
      isCurrent: currentTier === 'premium'
    },
    {
      id: 'subscription' as const,
      name: 'Subscription Tier',
      price: '$39',
      period: 'per month',
      description: 'Monthly subscription',
      features: [
        'Advanced LinkedIn optimization and ongoing pre-drafted content generation',
        'Resume and cover letter alignment per job description',
        'Content refresh and platform access'
      ],
      disabled: currentTier === 'subscription',
      isCurrent: currentTier === 'subscription'
    }
  ];

  const handleTierSelect = async (tier: 'premium' | 'subscription') => {
    setSelectedTier(tier);
    setIsLoading(true);

    try {
      const response = await apiRequest('POST', '/api/payments/create-checkout-session', { tier });
      const data = await response.json();

      if (data.qrCode && data.url) {
        setQrCode(data.qrCode);
        setCheckoutUrl(data.url);
      }
    } catch (error) {
      console.error('Error creating checkout session:', error);
      toast({
        title: "Error",
        description: "Failed to create checkout session. Please try again.",
        variant: "destructive",
      });
      setSelectedTier(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleProceedToCheckout = () => {
    if (checkoutUrl) {
      window.location.href = checkoutUrl;
    }
  };

  const handleBack = () => {
    setSelectedTier(null);
    setQrCode('');
    setCheckoutUrl('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-[900px]" data-testid="dialog-payment">
        <DialogHeader>
          <DialogTitle data-testid="text-payment-title">
            {selectedTier ? 'Complete Your Purchase' : 'Choose Your Plan'}
          </DialogTitle>
          <DialogDescription data-testid="text-payment-description">
            {selectedTier 
              ? 'Scan the QR code with your mobile device or click the button below to proceed'
              : 'Select the tier that best fits your professional branding needs'
            }
          </DialogDescription>
        </DialogHeader>

        {!selectedTier ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 py-3">
            {tiers.map((tier) => (
              <Card
                key={tier.id}
                className={`p-3 transition-all border-2 flex flex-col ${
                  tier.id === 'free'
                    ? 'border-muted bg-muted/20 cursor-default'
                    : tier.disabled 
                      ? 'opacity-60 cursor-not-allowed border-muted' 
                      : 'cursor-pointer hover:border-primary hover:shadow-md'
                }`}
                onClick={() => tier.id !== 'free' && !tier.disabled && handleTierSelect(tier.id)}
                data-testid={`card-tier-${tier.id}`}
              >
                <div className="mb-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <h3 className="text-base font-semibold" data-testid={`text-tier-name-${tier.id}`}>
                      {tier.name}
                    </h3>
                    {tier.isCurrent && (
                      <span className="px-1.5 py-0.5 bg-primary/10 text-primary text-[10px] font-medium rounded-full">
                        Current
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mb-2" data-testid={`text-tier-description-${tier.id}`}>
                    {tier.description}
                  </p>
                  <div className="mb-2">
                    <div className="text-xl font-bold" data-testid={`text-tier-price-${tier.id}`}>
                      {tier.price}
                    </div>
                    {tier.period && (
                      <div className="text-xs text-muted-foreground">
                        {tier.period}
                      </div>
                    )}
                  </div>
                </div>
                <ul className="space-y-1.5 flex-grow">
                  {tier.features.map((feature, index) => (
                    <li key={index} className="flex items-start text-xs leading-tight" data-testid={`text-feature-${tier.id}-${index}`}>
                      <Check className="h-3 w-3 mr-1.5 mt-0.5 text-primary flex-shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                {tier.disabled && tier.id !== 'free' && !tier.isCurrent && (
                  <div className="mt-3 text-xs text-muted-foreground text-center" data-testid={`text-tier-status-${tier.id}`}>
                    Already Subscribed
                  </div>
                )}
              </Card>
            ))}
          </div>
        ) : (
          <div className="space-y-4 py-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin" data-testid="loader-checkout" />
              </div>
            ) : (
              <>
                <div className="bg-muted rounded-lg p-6 space-y-4">
                  <div className="text-center">
                    <h4 className="font-semibold mb-2" data-testid="text-selected-tier">
                      {tiers.find(t => t.id === selectedTier)?.name}
                    </h4>
                    <p className="text-2xl font-bold" data-testid="text-selected-price">
                      {tiers.find(t => t.id === selectedTier)?.price}
                      {selectedTier === 'subscription' && <span className="text-sm font-normal"> /month</span>}
                    </p>
                  </div>

                  {qrCode && (
                    <div className="flex flex-col items-center space-y-2">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <QrCode className="h-4 w-4" />
                        <span>Scan with mobile device</span>
                      </div>
                      <img 
                        src={qrCode} 
                        alt="Payment QR Code" 
                        className="w-48 h-48 border-2 border-border rounded-lg"
                        data-testid="img-qr-code"
                      />
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={handleBack}
                    className="flex-1"
                    data-testid="button-back"
                  >
                    Back
                  </Button>
                  <Button
                    onClick={handleProceedToCheckout}
                    className="flex-1"
                    data-testid="button-proceed"
                  >
                    Proceed to Checkout
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
