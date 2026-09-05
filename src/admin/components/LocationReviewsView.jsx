import React from 'react';
import {
  Box,
  Text,
  Badge,
  Avatar,
  Icon,
  H5,
} from '@adminjs/design-system';

const StarRating = ({ rating }) => {
  const stars = [];

  for (let i = 1; i <= 5; i++) {
    stars.push(
      <Icon
        key={i}
        icon="Star"
        size={18}
        color={
          i <= rating
            ? '#F59E0B'
            : '#D1D5DB'
        }
      />
    );
  }

  return (
    <Box
      flex
      alignItems="center"
      gap="xs"
    >
      {stars}
    </Box>
  );
};

const formatDate = (date) => {
  if (!date) return '';

  try {
    return new Date(date).toLocaleDateString(
      'en-IN',
      {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }
    );
  } catch {
    return '';
  }
};

const LocationReviewsView = (props) => {

  const reviewsData =
    props?.record?.params?.reviews || {};

  const reviews =
    reviewsData.items || [];

  const totalReviews =
    reviewsData.totalReviews ||
    reviews.length;

  const averageRating =
    reviewsData.averageRating || 0;


  return (
    <Box
      width="100%"
      mt="xl"
    >

      {/* ─────────────────────────────────────────────
          Header
      ───────────────────────────────────────────── */}

      <Box
        flex
        justifyContent="space-between"
        alignItems="center"
        mb="lg"
      >

        <Box>
          <H5
            mb="sm"
          >
            Reviews
          </H5>

          <Text
            color="grey60"
          >
            Customer feedback for this location
          </Text>
        </Box>


        {/* Rating summary */}

        <Box
          flex
          alignItems="center"
          gap="lg"
        >

          <Box
            textAlign="center"
          >

            <Text
              fontSize="xl"
              fontWeight="bold"
            >
              {averageRating || '—'}
            </Text>

            <Box
              flex
              alignItems="center"
              justifyContent="center"
              mt="xs"
            >
              <StarRating
                rating={
                  Math.round(
                    averageRating
                  )
                }
              />
            </Box>

          </Box>


          <Box
            textAlign="center"
          >

            <Text
              fontSize="xl"
              fontWeight="bold"
            >
              {totalReviews}
            </Text>

            <Text
              color="grey60"
            >
              {totalReviews === 1
                ? 'Review'
                : 'Reviews'}
            </Text>

          </Box>

        </Box>

      </Box>


      {/* ─────────────────────────────────────────────
          Empty state
      ───────────────────────────────────────────── */}

      {reviews.length === 0 && (

        <Box
          border="default"
          borderRadius="default"
          p="xl"
          textAlign="center"
          bg="white"
        >

          <Icon
            icon="MessageCircle"
            size={32}
            color="#9CA3AF"
          />

          <Text
            mt="lg"
            fontWeight="bold"
          >
            No reviews yet
          </Text>

          <Text
            mt="sm"
            color="grey60"
          >
            This location hasn't received
            any reviews.
          </Text>

        </Box>

      )}


      {/* ─────────────────────────────────────────────
          Review list
      ───────────────────────────────────────────── */}

      {reviews.length > 0 && (

        <Box>

          {reviews.map((review) => (

            <Box
              key={review._id}
              border="default"
              borderRadius="default"
              p="lg"
              mb="md"
              bg="white"
            >

              {/* Reviewer */}

              <Box
                flex
                justifyContent="space-between"
                alignItems="flex-start"
              >

                <Box
                  flex
                  alignItems="center"
                  gap="md"
                >

                  {review.user?.photo ? (

                    <Avatar
                      src={review.user.photo}
                      alt={
                        review.user.name
                      }
                      size="medium"
                    />

                  ) : (

                    <Avatar
                      size="medium"
                    >
                      {(
                        review.user?.name ||
                        'U'
                      )
                        .charAt(0)
                        .toUpperCase()}
                    </Avatar>

                  )}


                  <Box>

                    <Text
                      fontWeight="bold"
                    >
                      {
                        review.user?.name ||
                        'Unknown user'
                      }
                    </Text>

                    {review.user?.email && (

                      <Text
                        fontSize="sm"
                        color="grey60"
                        mt="xs"
                      >
                        {review.user.email}
                      </Text>

                    )}

                  </Box>

                </Box>


                {/* Date */}

                <Text
                  fontSize="sm"
                  color="grey60"
                >
                  {formatDate(
                    review.createdAt
                  )}
                </Text>

              </Box>


              {/* Rating */}

              <Box
                mt="md"
                flex
                alignItems="center"
                gap="md"
              >

                <StarRating
                  rating={
                    Number(
                      review.rating
                    ) || 0
                  }
                />

                <Badge
                  variant="success"
                >
                  {review.rating}/5
                </Badge>

              </Box>


              {/* Comment */}

              {review.comment && (

                <Box
                  mt="md"
                >

                  <Text
                    lineHeight="lg"
                  >
                    {review.comment}
                  </Text>

                </Box>

              )}

            </Box>

          ))}

        </Box>

      )}

    </Box>
  );
};

export default LocationReviewsView;